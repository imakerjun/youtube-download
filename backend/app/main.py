import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import Database
from app.api.routes import router
import app.api.routes as routes_module

db = Database(settings.db_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init()
    routes_module.db = db
    yield
    await db.close()

app = FastAPI(title="YouTube Downloader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws/progress")
async def websocket_progress(ws: WebSocket):
    from app.ws.progress import connections
    await ws.accept()
    connections.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connections.discard(ws)

# ── Static file serving (Electron production mode) ──────
static_dir = os.environ.get("YTD_STATIC_DIR")
if static_dir and Path(static_dir).is_dir():
    app.mount("/assets", StaticFiles(directory=Path(static_dir) / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(request: Request, path: str):
        file_path = Path(static_dir) / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(Path(static_dir) / "index.html")
