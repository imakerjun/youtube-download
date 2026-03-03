import asyncio
from pathlib import Path
from typing import Any, Callable
import yt_dlp
from app.core.config import settings

class VideoExtractor:
    async def extract(self, url: str) -> dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._extract_sync, url)

    def _extract_sync(self, url: str) -> dict[str, Any]:
        opts = {"quiet": True, "no_warnings": True, "extract_flat": False}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if info.get("_type") == "playlist":
            return {
                "is_playlist": True,
                "playlist_id": info.get("id", ""),
                "title": info.get("title", ""),
                "entries": [
                    {
                        "video_id": e.get("id", ""),
                        "title": e.get("title", ""),
                        "channel": e.get("channel", ""),
                        "duration": e.get("duration", 0),
                        "thumbnail_url": e.get("thumbnail", ""),
                    }
                    for e in (info.get("entries") or [])
                    if e is not None
                ],
            }

        return {
            "is_playlist": False,
            "video_id": info.get("id", ""),
            "title": info.get("title", ""),
            "channel": info.get("channel", ""),
            "duration": info.get("duration", 0),
            "thumbnail_url": info.get("thumbnail", ""),
            "formats": [
                {
                    "format_id": f.get("format_id", ""),
                    "ext": f.get("ext", ""),
                    "resolution": f.get("resolution", ""),
                    "filesize": f.get("filesize"),
                    "acodec": f.get("acodec", ""),
                    "vcodec": f.get("vcodec", ""),
                }
                for f in (info.get("formats") or [])
                if f.get("vcodec") != "none"
            ],
        }


class DownloadManager:
    def __init__(self, download_dir: Path | None = None):
        self.download_dir = download_dir or settings.download_dir

    async def download(
        self,
        url: str,
        format_id: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        progress_callback: Callable[[float, str], None] | None = None,
    ) -> dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._download_sync, url, format_id, progress_callback
        )

    def _download_sync(
        self, url: str, format_id: str,
        progress_callback: Callable[[float, str], None] | None,
    ) -> dict[str, Any]:
        self.download_dir.mkdir(parents=True, exist_ok=True)
        result = {}

        def hook(d):
            if d["status"] == "downloading" and progress_callback:
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                pct = (downloaded / total * 100) if total else 0
                progress_callback(pct, d.get("_default_template", ""))
            elif d["status"] == "finished":
                result["file_path"] = d.get("filename", "")
                result["file_size"] = d.get("total_bytes", 0)

        opts = {
            "format": format_id,
            "outtmpl": str(self.download_dir / "%(title)s [%(id)s].%(ext)s"),
            "progress_hooks": [hook],
            "quiet": True,
            "no_warnings": True,
            "merge_output_format": "mp4",
        }

        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        return result
