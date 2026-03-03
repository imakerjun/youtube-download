import pytest
from unittest.mock import patch, MagicMock
from app.core.downloader import VideoExtractor

@pytest.mark.anyio
async def test_extract_info_returns_metadata():
    mock_info = {
        "id": "dQw4w9WgXcQ",
        "title": "Rick Astley - Never Gonna Give You Up",
        "channel": "Rick Astley",
        "duration": 212,
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        "formats": [
            {"format_id": "18", "ext": "mp4", "resolution": "360p",
             "filesize": 10000000, "acodec": "aac", "vcodec": "avc1"},
            {"format_id": "22", "ext": "mp4", "resolution": "720p",
             "filesize": 30000000, "acodec": "aac", "vcodec": "avc1"},
        ],
    }

    with patch("app.core.downloader.yt_dlp.YoutubeDL") as MockYDL:
        instance = MockYDL.return_value.__enter__.return_value
        instance.extract_info.return_value = mock_info

        extractor = VideoExtractor()
        info = await extractor.extract("https://youtube.com/watch?v=dQw4w9WgXcQ")

        assert info["video_id"] == "dQw4w9WgXcQ"
        assert info["title"] == "Rick Astley - Never Gonna Give You Up"
        assert len(info["formats"]) == 2

@pytest.mark.anyio
async def test_extract_playlist():
    mock_info = {
        "id": "PLtest",
        "title": "Test Playlist",
        "_type": "playlist",
        "entries": [
            {"id": "vid1", "title": "Video 1", "channel": "Ch", "duration": 60,
             "thumbnail": ""},
            {"id": "vid2", "title": "Video 2", "channel": "Ch", "duration": 120,
             "thumbnail": ""},
        ],
    }

    with patch("app.core.downloader.yt_dlp.YoutubeDL") as MockYDL:
        instance = MockYDL.return_value.__enter__.return_value
        instance.extract_info.return_value = mock_info

        extractor = VideoExtractor()
        info = await extractor.extract("https://youtube.com/playlist?list=PLtest")

        assert info["is_playlist"] is True
        assert len(info["entries"]) == 2
