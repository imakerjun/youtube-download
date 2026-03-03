import asyncio
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.core.downloader import VideoExtractor, DownloadManager
from app.core.database import Database

router = APIRouter(prefix="/api")
extractor = VideoExtractor()
download_manager = DownloadManager()

# Will be set from main.py
db: Database = None

class ExtractRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

@router.post("/extract")
async def extract_info(req: ExtractRequest):
    info = await extractor.extract(req.url)
    return info

@router.post("/downloads", status_code=201)
async def create_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    info = await extractor.extract(req.url)

    if info.get("is_playlist"):
        raise HTTPException(400, "Use /api/extract first for playlists")

    download_id = await db.create_download(
        url=req.url,
        video_id=info["video_id"],
        title=info["title"],
        channel=info["channel"],
        duration=info["duration"],
        thumbnail_url=info["thumbnail_url"],
        format_id=req.format_id,
    )

    background_tasks.add_task(run_download, download_id, req.url, req.format_id)

    download = await db.get_download(download_id)
    return download

@router.get("/downloads")
async def list_downloads(limit: int = 50, offset: int = 0):
    return await db.list_downloads(limit=limit, offset=offset)

@router.get("/downloads/{download_id}")
async def get_download(download_id: int):
    download = await db.get_download(download_id)
    if not download:
        raise HTTPException(404, "Download not found")
    return download

@router.delete("/downloads/{download_id}")
async def cancel_download(download_id: int):
    download = await db.get_download(download_id)
    if not download:
        raise HTTPException(404, "Download not found")
    await db.update_download(download_id, status="cancelled")
    return {"status": "cancelled"}

async def run_download(download_id: int, url: str, format_id: str):
    from app.ws.progress import broadcast_progress

    await db.update_download(download_id, status="downloading")

    def on_progress(pct: float, msg: str):
        asyncio.get_event_loop().call_soon_threadsafe(
            asyncio.create_task,
            _update_progress(download_id, pct)
        )

    try:
        result = await download_manager.download(url, format_id, on_progress)
        await db.update_download(
            download_id,
            status="completed",
            progress=100,
            file_path=result.get("file_path", ""),
            file_size=result.get("file_size", 0),
            completed_at=__import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        )
        await broadcast_progress(download_id, 100, "completed")
    except Exception as e:
        await db.update_download(
            download_id, status="failed", error_message=str(e)
        )
        await broadcast_progress(download_id, 0, "failed")

async def _update_progress(download_id: int, pct: float):
    from app.ws.progress import broadcast_progress
    await db.update_download(download_id, progress=pct)
    await broadcast_progress(download_id, pct, "downloading")
