import pytest
from unittest.mock import patch, AsyncMock
from httpx import ASGITransport, AsyncClient
from app.main import app, db
from app.core.database import Database

@pytest.fixture
async def test_db(tmp_path):
    test_database = Database(tmp_path / "test.db")
    await test_database.init()
    # Replace the app's db with test db
    import app.main as main_module
    original_db = main_module.db
    main_module.db = test_database
    import app.api.routes as routes_module
    routes_module.db = test_database
    yield test_database
    main_module.db = original_db
    await test_database.close()

@pytest.fixture
async def client(test_db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.mark.anyio
async def test_extract_video_info(client):
    mock_info = {
        "is_playlist": False,
        "video_id": "abc123",
        "title": "Test Video",
        "channel": "Test Ch",
        "duration": 120,
        "thumbnail_url": "https://img.youtube.com/vi/abc123/0.jpg",
        "formats": [{"format_id": "22", "ext": "mp4", "resolution": "720p",
                     "filesize": 30000000, "acodec": "aac", "vcodec": "avc1"}],
    }

    with patch("app.api.routes.extractor") as mock_ext:
        mock_ext.extract = AsyncMock(return_value=mock_info)
        resp = await client.post("/api/extract", json={"url": "https://youtube.com/watch?v=abc123"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Test Video"
    assert len(data["formats"]) == 1

@pytest.mark.anyio
async def test_create_download(client):
    with patch("app.api.routes.extractor") as mock_ext:
        mock_ext.extract = AsyncMock(return_value={
            "is_playlist": False,
            "video_id": "xyz789",
            "title": "Download Test",
            "channel": "Ch",
            "duration": 60,
            "thumbnail_url": "",
            "formats": [],
        })

        resp = await client.post("/api/downloads", json={
            "url": "https://youtube.com/watch?v=xyz789",
            "format_id": "22",
        })

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending"
    assert data["video_id"] == "xyz789"

@pytest.mark.anyio
async def test_list_downloads(client):
    resp = await client.get("/api/downloads")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

@pytest.mark.anyio
async def test_delete_download(client, test_db):
    dl_id = await test_db.create_download(
        url="https://youtube.com/watch?v=test",
        video_id="test", title="Test", channel="Ch",
        duration=60, thumbnail_url="", format_id="22",
    )
    resp = await client.delete(f"/api/downloads/{dl_id}/delete")
    assert resp.status_code == 200
    dl = await test_db.get_download(dl_id)
    assert dl is None

@pytest.mark.anyio
async def test_retry_download(client, test_db):
    dl_id = await test_db.create_download(
        url="https://youtube.com/watch?v=retry",
        video_id="retry", title="Retry Test", channel="Ch",
        duration=60, thumbnail_url="", format_id="22",
    )
    await test_db.update_download(dl_id, status="failed", error_message="err")

    with patch("app.api.routes.download_manager") as mock_dm:
        mock_dm.download = AsyncMock(return_value={"file_path": "/tmp/test.mp4", "file_size": 1000})
        resp = await client.post(f"/api/downloads/{dl_id}/retry")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["error_message"] is None
    # After background task completes, status may have progressed to completed
    dl = await test_db.get_download(dl_id)
    assert dl["status"] in ("pending", "downloading", "completed")
    assert dl["error_message"] is None

@pytest.mark.anyio
async def test_clear_completed(client, test_db):
    for i in range(3):
        dl_id = await test_db.create_download(
            url=f"https://youtube.com/watch?v=clear{i}",
            video_id=f"clear{i}", title=f"Clear {i}", channel="Ch",
            duration=60, thumbnail_url="", format_id="22",
        )
        if i < 2:
            await test_db.update_download(dl_id, status="completed")

    resp = await client.delete("/api/downloads/completed")
    assert resp.status_code == 200
    remaining = await test_db.list_downloads()
    assert len(remaining) == 1
    assert remaining[0]["status"] != "completed"


@pytest.mark.anyio
async def test_batch_download(client, test_db):
    mock_infos = [
        {
            "is_playlist": False,
            "video_id": f"batch{i}",
            "title": f"Batch Video {i}",
            "channel": "Test Ch",
            "duration": 60,
            "thumbnail_url": "",
            "formats": [],
        }
        for i in range(3)
    ]

    with patch("app.api.routes.extractor") as mock_ext:
        mock_ext.extract = AsyncMock(side_effect=mock_infos)
        resp = await client.post("/api/downloads/batch", json={
            "urls": [
                "https://youtube.com/watch?v=batch0",
                "https://youtube.com/watch?v=batch1",
                "https://youtube.com/watch?v=batch2",
            ],
            "format_id": "22",
        })

    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 3
    assert all(d["status"] == "pending" for d in data)


@pytest.mark.anyio
async def test_extract_playlist(client):
    mock_playlist = {
        "is_playlist": True,
        "playlist_id": "PLabc",
        "title": "Test Playlist",
        "entries": [
            {"video_id": "v1", "title": "Vid 1", "channel": "Ch", "duration": 60, "thumbnail_url": ""},
            {"video_id": "v2", "title": "Vid 2", "channel": "Ch", "duration": 120, "thumbnail_url": ""},
        ],
    }

    with patch("app.api.routes.extractor") as mock_ext:
        mock_ext.extract = AsyncMock(return_value=mock_playlist)
        resp = await client.post("/api/extract", json={"url": "https://youtube.com/playlist?list=PLabc"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_playlist"] is True
    assert len(data["entries"]) == 2
