import pytest
from app.core.database import Database

@pytest.mark.anyio
async def test_create_and_get_download(tmp_path):
    db = Database(tmp_path / "test.db")
    await db.init()

    download_id = await db.create_download(
        url="https://youtube.com/watch?v=test123",
        video_id="test123",
        title="Test Video",
        channel="Test Channel",
        duration=120,
        thumbnail_url="https://img.youtube.com/vi/test123/0.jpg",
        format_id="22",
    )

    download = await db.get_download(download_id)
    assert download["title"] == "Test Video"
    assert download["status"] == "pending"
    await db.close()

@pytest.mark.anyio
async def test_update_download_status(tmp_path):
    db = Database(tmp_path / "test.db")
    await db.init()

    download_id = await db.create_download(
        url="https://youtube.com/watch?v=test456",
        video_id="test456",
        title="Test",
        channel="Ch",
        duration=60,
        thumbnail_url="",
        format_id="22",
    )

    await db.update_download(download_id, status="downloading", progress=50)
    download = await db.get_download(download_id)
    assert download["status"] == "downloading"
    assert download["progress"] == 50
    await db.close()

@pytest.mark.anyio
async def test_list_downloads(tmp_path):
    db = Database(tmp_path / "test.db")
    await db.init()

    await db.create_download(url="https://youtube.com/watch?v=a", video_id="a",
        title="A", channel="Ch", duration=60, thumbnail_url="", format_id="22")
    await db.create_download(url="https://youtube.com/watch?v=b", video_id="b",
        title="B", channel="Ch", duration=60, thumbnail_url="", format_id="22")

    downloads = await db.list_downloads()
    assert len(downloads) == 2
    await db.close()
