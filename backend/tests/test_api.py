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
