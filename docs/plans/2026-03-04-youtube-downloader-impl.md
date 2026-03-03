# YouTube Downloader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 본인 전용 YouTube 영상 아카이빙 로컬 웹앱 구축

**Architecture:** FastAPI 백엔드가 yt-dlp를 Python 라이브러리로 호출하여 다운로드를 수행하고, SQLite에 이력/메타데이터를 저장한다. React + Vite 프론트엔드가 REST API와 WebSocket으로 백엔드와 통신한다. Docker Compose로 전체 스택을 실행한다.

**Tech Stack:** Python 3.12, FastAPI, yt-dlp, SQLite (aiosqlite), React 18, Vite, Tailwind CSS, Docker Compose

**Design Doc:** `docs/plans/2026-03-04-youtube-downloader-design.md`

---

### Task 1: Backend 프로젝트 스캐폴딩

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

**Step 1: requirements.txt 생성**

```txt
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
yt-dlp>=2024.12.0
aiosqlite>=0.20.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
pytest>=8.0.0
pytest-asyncio>=0.24.0
httpx>=0.27.0
```

**Step 2: config.py 작성**

```python
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    download_dir: Path = Path("/app/downloads")
    data_dir: Path = Path("/app/data")
    db_path: Path = Path("/app/data/youtube_dl.db")
    max_concurrent_downloads: int = 2

    model_config = {"env_prefix": "YTD_"}

settings = Settings()
```

**Step 3: FastAPI 앱 진입점 작성**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="YouTube Downloader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Step 4: pytest conftest 작성**

```python
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

**Step 5: health 엔드포인트 테스트 작성 및 실행**

Create `backend/tests/test_health.py`:
```python
import pytest

@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

Run: `cd backend && pip install -r requirements.txt && pytest tests/test_health.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend with FastAPI and health endpoint"
```

---

### Task 2: 데이터베이스 모델 및 초기화

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/download.py`
- Create: `backend/app/core/database.py`
- Create: `backend/tests/test_database.py`
- Modify: `backend/app/main.py` (lifespan 추가)

**Step 1: 테스트 작성**

Create `backend/tests/test_database.py`:
```python
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
```

**Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && pytest tests/test_database.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.database'`

**Step 3: Database 클래스 구현**

Create `backend/app/core/database.py`:
```python
import aiosqlite
from pathlib import Path
from datetime import datetime, timezone

class Database:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db: aiosqlite.Connection | None = None

    async def init(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = await aiosqlite.connect(self.db_path)
        self.db.row_factory = aiosqlite.Row
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT '',
                duration INTEGER NOT NULL DEFAULT 0,
                thumbnail_url TEXT NOT NULL DEFAULT '',
                format_id TEXT NOT NULL DEFAULT '',
                file_path TEXT,
                file_size INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                progress REAL NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        """)
        await self.db.commit()

    async def close(self):
        if self.db:
            await self.db.close()

    async def create_download(self, *, url: str, video_id: str, title: str,
                              channel: str, duration: int, thumbnail_url: str,
                              format_id: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO downloads (url, video_id, title, channel, duration,
               thumbnail_url, format_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (url, video_id, title, channel, duration, thumbnail_url, format_id, now),
        )
        await self.db.commit()
        return cursor.lastrowid

    async def get_download(self, download_id: int) -> dict | None:
        cursor = await self.db.execute(
            "SELECT * FROM downloads WHERE id = ?", (download_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def update_download(self, download_id: int, **fields) -> None:
        if not fields:
            return
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [download_id]
        await self.db.execute(
            f"UPDATE downloads SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()

    async def list_downloads(self, limit: int = 50, offset: int = 0) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT * FROM downloads ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
```

**Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && pytest tests/test_database.py -v`
Expected: PASS (3 tests)

**Step 5: main.py에 DB lifespan 추가**

Modify `backend/app/main.py` — FastAPI lifespan에서 DB 초기화/종료:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Database

db = Database(settings.db_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init()
    yield
    await db.close()

app = FastAPI(title="YouTube Downloader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Step 6: 전체 테스트 통과 확인 후 커밋**

Run: `cd backend && pytest -v`
Expected: PASS (4 tests)

```bash
git add backend/
git commit -m "feat: add SQLite database layer with downloads table"
```

---

### Task 3: yt-dlp 다운로드 매니저

**Files:**
- Create: `backend/app/core/downloader.py`
- Create: `backend/tests/test_downloader.py`

**Step 1: 테스트 작성**

Create `backend/tests/test_downloader.py`:
```python
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
```

**Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && pytest tests/test_downloader.py -v`
Expected: FAIL

**Step 3: VideoExtractor 및 DownloadManager 구현**

Create `backend/app/core/downloader.py`:
```python
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
```

**Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_downloader.py -v`
Expected: PASS (2 tests)

**Step 5: 커밋**

```bash
git add backend/
git commit -m "feat: add yt-dlp video extractor and download manager"
```

---

### Task 4: API 라우트 (다운로드 + 추출)

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/routes.py`
- Create: `backend/tests/test_api.py`
- Modify: `backend/app/main.py` (라우터 등록)

**Step 1: 테스트 작성**

Create `backend/tests/test_api.py`:
```python
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
```

**Step 2: 테스트 실행 — 실패 확인**

Run: `cd backend && pytest tests/test_api.py -v`
Expected: FAIL

**Step 3: API 라우트 구현**

Create `backend/app/api/routes.py`:
```python
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
```

**Step 4: main.py에 라우터 등록**

Modify `backend/app/main.py` — 라우터 포함 + db 주입:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
```

**Step 5: WebSocket placeholder 생성 (import 에러 방지)**

Create `backend/app/ws/__init__.py` (empty)
Create `backend/app/ws/progress.py`:
```python
from fastapi import WebSocket
from typing import Set

connections: Set[WebSocket] = set()

async def broadcast_progress(download_id: int, progress: float, status: str):
    message = {"download_id": download_id, "progress": progress, "status": status}
    dead = set()
    for ws in connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    connections -= dead
```

**Step 6: 테스트 통과 확인**

Run: `cd backend && pytest -v`
Expected: PASS (all tests)

**Step 7: 커밋**

```bash
git add backend/
git commit -m "feat: add REST API routes for downloads and extraction"
```

---

### Task 5: WebSocket 진행률 엔드포인트

**Files:**
- Modify: `backend/app/ws/progress.py`
- Create: `backend/tests/test_websocket.py`
- Modify: `backend/app/main.py` (WS 라우트 등록)

**Step 1: 테스트 작성**

Create `backend/tests/test_websocket.py`:
```python
import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient
from app.main import app

def test_websocket_connect():
    client = TestClient(app)
    with client.websocket_connect("/ws/progress") as ws:
        # Connection should succeed
        from app.ws.progress import connections, broadcast_progress
        # Just verify the connection works by closing gracefully
        pass
```

**Step 2: WS 라우트를 main.py에 추가**

Modify `backend/app/main.py` — WebSocket 엔드포인트 추가:
```python
from fastapi import WebSocket, WebSocketDisconnect
from app.ws.progress import connections

@app.websocket("/ws/progress")
async def websocket_progress(ws: WebSocket):
    await ws.accept()
    connections.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connections.discard(ws)
```

**Step 3: 테스트 통과 확인**

Run: `cd backend && pytest -v`
Expected: PASS

**Step 4: 커밋**

```bash
git add backend/
git commit -m "feat: add WebSocket endpoint for download progress"
```

---

### Task 6: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

**Step 1: Dockerfile 작성**

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: 커밋**

```bash
git add backend/Dockerfile
git commit -m "feat: add backend Dockerfile with ffmpeg"
```

---

### Task 7: Frontend 스캐폴딩 (React + Vite + Tailwind)

**Files:**
- Create: `frontend/` (Vite 프로젝트)

**Step 1: Vite + React + TypeScript 프로젝트 생성**

```bash
cd /path/to/youtube-download
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
```

**Step 2: Tailwind CSS 설정**

Modify `frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
```

Modify `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 3: 기본 App 컴포넌트 작성**

Replace `frontend/src/App.tsx`:
```tsx
import { useState } from "react";

function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">YouTube Downloader</h1>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-gray-400">Ready to download.</p>
      </main>
    </div>
  );
}

export default App;
```

**Step 4: 실행 확인**

Run: `cd frontend && npm run dev`
Expected: `http://localhost:5173`에서 "YouTube Downloader" 페이지 렌더링

**Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat: scaffold React + Vite + Tailwind frontend"
```

---

### Task 8: Frontend API 클라이언트 + 타입 정의

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/hooks/useWebSocket.ts`

**Step 1: 타입 정의**

Create `frontend/src/api/types.ts`:
```typescript
export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  acodec: string;
  vcodec: string;
}

export interface VideoInfo {
  is_playlist: boolean;
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  formats: VideoFormat[];
}

export interface PlaylistInfo {
  is_playlist: true;
  playlist_id: string;
  title: string;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
}

export interface Download {
  id: number;
  url: string;
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  format_id: string;
  file_path: string | null;
  file_size: number | null;
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProgressMessage {
  download_id: number;
  progress: number;
  status: string;
}
```

**Step 2: API 클라이언트**

Create `frontend/src/api/client.ts`:
```typescript
import type { Download, VideoInfo, PlaylistInfo } from "./types";

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  extract: (url: string) =>
    fetchJSON<VideoInfo | PlaylistInfo>("/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  createDownload: (url: string, format_id: string) =>
    fetchJSON<Download>("/downloads", {
      method: "POST",
      body: JSON.stringify({ url, format_id }),
    }),

  listDownloads: () => fetchJSON<Download[]>("/downloads"),

  getDownload: (id: number) => fetchJSON<Download>(`/downloads/${id}`),

  cancelDownload: (id: number) =>
    fetchJSON<{ status: string }>(`/downloads/${id}`, { method: "DELETE" }),
};
```

**Step 3: WebSocket 훅**

Create `frontend/src/hooks/useWebSocket.ts`:
```typescript
import { useEffect, useRef, useCallback } from "react";
import type { ProgressMessage } from "../api/types";

export function useProgressWebSocket(
  onProgress: (msg: ProgressMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/progress`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ProgressMessage;
      callbackRef.current(data);
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        wsRef.current = null;
      }, 3000);
    };

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  return wsRef;
}
```

**Step 4: 커밋**

```bash
git add frontend/src/api/ frontend/src/hooks/
git commit -m "feat: add API client, types, and WebSocket hook"
```

---

### Task 9: Frontend 다운로드 UI 컴포넌트

**Files:**
- Create: `frontend/src/components/UrlInput.tsx`
- Create: `frontend/src/components/FormatSelector.tsx`
- Create: `frontend/src/components/DownloadList.tsx`
- Create: `frontend/src/components/ProgressBar.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: ProgressBar 컴포넌트**

Create `frontend/src/components/ProgressBar.tsx`:
```tsx
interface Props {
  progress: number;
  status: string;
}

export function ProgressBar({ progress, status }: Props) {
  const color =
    status === "completed" ? "bg-green-500" :
    status === "failed" ? "bg-red-500" :
    "bg-blue-500";

  return (
    <div className="w-full bg-gray-800 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}
```

**Step 2: UrlInput 컴포넌트**

Create `frontend/src/components/UrlInput.tsx`:
```tsx
import { useState } from "react";

interface Props {
  onSubmit: (urls: string[]) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = input
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) onSubmit(urls);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="YouTube URL을 입력하세요 (여러 개는 줄바꿈으로 구분)"
        className="w-full rounded-lg bg-gray-900 border border-gray-700 p-3 text-sm
                   placeholder-gray-500 focus:border-blue-500 focus:outline-none
                   resize-y min-h-[80px]"
        rows={3}
      />
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium
                   hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "분석 중..." : "다운로드"}
      </button>
    </form>
  );
}
```

**Step 3: FormatSelector 컴포넌트**

Create `frontend/src/components/FormatSelector.tsx`:
```tsx
import type { VideoInfo, VideoFormat } from "../api/types";

interface Props {
  info: VideoInfo;
  onSelect: (formatId: string) => void;
  onCancel: () => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "N/A";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export function FormatSelector({ info, onSelect, onCancel }: Props) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
      <div className="flex gap-3">
        {info.thumbnail_url && (
          <img src={info.thumbnail_url} alt="" className="w-32 rounded" />
        )}
        <div>
          <h3 className="font-medium">{info.title}</h3>
          <p className="text-sm text-gray-400">{info.channel}</p>
        </div>
      </div>
      <div className="space-y-1">
        {info.formats
          .filter((f) => f.resolution && f.resolution !== "audio only")
          .map((f) => (
            <button
              key={f.format_id}
              onClick={() => onSelect(f.format_id)}
              className="w-full flex justify-between items-center rounded px-3 py-2
                         text-sm hover:bg-gray-800"
            >
              <span>{f.resolution} ({f.ext})</span>
              <span className="text-gray-400">{formatSize(f.filesize)}</span>
            </button>
          ))}
        <button
          onClick={() => onSelect("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")}
          className="w-full rounded px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 font-medium"
        >
          최고 화질로 다운로드
        </button>
      </div>
      <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-300">
        취소
      </button>
    </div>
  );
}
```

**Step 4: DownloadList 컴포넌트**

Create `frontend/src/components/DownloadList.tsx`:
```tsx
import type { Download } from "../api/types";
import { ProgressBar } from "./ProgressBar";

interface Props {
  downloads: Download[];
}

const statusLabel: Record<string, string> = {
  pending: "대기",
  downloading: "다운로드 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
};

export function DownloadList({ downloads }: Props) {
  if (downloads.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-medium">다운로드 목록</h2>
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium">{dl.title}</p>
              <p className="text-xs text-gray-500">{dl.channel}</p>
            </div>
            <span className="text-xs text-gray-400">
              {statusLabel[dl.status] || dl.status}
            </span>
          </div>
          {(dl.status === "downloading" || dl.status === "pending") && (
            <ProgressBar progress={dl.progress} status={dl.status} />
          )}
          {dl.status === "failed" && dl.error_message && (
            <p className="text-xs text-red-400">{dl.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 5: App.tsx 통합**

Replace `frontend/src/App.tsx`:
```tsx
import { useState, useEffect, useCallback } from "react";
import { api } from "./api/client";
import type { Download, VideoInfo } from "./api/types";
import { useProgressWebSocket } from "./hooks/useWebSocket";
import { UrlInput } from "./components/UrlInput";
import { FormatSelector } from "./components/FormatSelector";
import { DownloadList } from "./components/DownloadList";

function App() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDownloads = useCallback(async () => {
    const list = await api.listDownloads();
    setDownloads(list);
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useProgressWebSocket((msg) => {
    setDownloads((prev) =>
      prev.map((dl) =>
        dl.id === msg.download_id
          ? { ...dl, progress: msg.progress, status: msg.status as Download["status"] }
          : dl
      )
    );
  });

  const handleUrls = async (urls: string[]) => {
    setError("");

    if (urls.length === 1) {
      setLoading(true);
      try {
        const info = await api.extract(urls[0]);
        if (info.is_playlist) {
          // Playlist — download all with best quality
          // Future: show playlist selector
          setError("재생목록 지원은 추후 추가 예정");
        } else {
          setVideoInfo(info as VideoInfo);
          setCurrentUrl(urls[0]);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Batch download with best quality
      setLoading(true);
      try {
        for (const url of urls) {
          await api.createDownload(url, "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
        }
        await loadDownloads();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFormatSelect = async (formatId: string) => {
    try {
      await api.createDownload(currentUrl, formatId);
      setVideoInfo(null);
      setCurrentUrl("");
      await loadDownloads();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">YouTube Downloader</h1>
      </header>
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        <UrlInput onSubmit={handleUrls} loading={loading} />

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {videoInfo && (
          <FormatSelector
            info={videoInfo}
            onSelect={handleFormatSelect}
            onCancel={() => setVideoInfo(null)}
          />
        )}

        <DownloadList downloads={downloads} />
      </main>
    </div>
  );
}

export default App;
```

**Step 6: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공

**Step 7: 커밋**

```bash
git add frontend/
git commit -m "feat: add download UI components and app integration"
```

---

### Task 10: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

**Step 1: nginx.conf 작성**

Create `frontend/nginx.conf`:
```nginx
server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Step 2: Dockerfile 작성**

Create `frontend/Dockerfile`:
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

**Step 3: 커밋**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: add frontend Dockerfile with nginx proxy"
```

---

### Task 11: Docker Compose + 통합 테스트

**Files:**
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: docker-compose.yml 작성**

Create `docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./downloads:/app/downloads
      - ./data:/app/data
    environment:
      - YTD_DOWNLOAD_DIR=/app/downloads
      - YTD_DATA_DIR=/app/data
      - YTD_DB_PATH=/app/data/youtube_dl.db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

**Step 2: .dockerignore 작성**

Create `.dockerignore`:
```
node_modules
__pycache__
*.pyc
.git
downloads
data
```

**Step 3: Docker Compose 빌드 및 실행 테스트**

```bash
docker compose build
docker compose up -d
# 확인
curl http://localhost:8000/api/health
# 브라우저에서 http://localhost:3000 접속
docker compose down
```

**Step 4: 커밋**

```bash
git add docker-compose.yml .dockerignore
git commit -m "feat: add Docker Compose for full-stack deployment"
```

---

### Task 12: CLAUDE.md 업데이트 + .gitignore

**Files:**
- Modify: `CLAUDE.md`
- Create: `.gitignore`

**Step 1: .gitignore 작성**

Create `.gitignore`:
```
# Downloads & data
downloads/
data/

# Python
__pycache__/
*.pyc
.venv/

# Node
node_modules/
frontend/dist/

# OS
.DS_Store
```

**Step 2: CLAUDE.md 업데이트**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

본인 전용 YouTube 영상 아카이빙 로컬 웹앱. FastAPI + yt-dlp 백엔드, React + Vite 프론트엔드, Docker Compose 실행.

## Commands

### 전체 실행
docker compose up --build

### 백엔드만 개발
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

### 프론트엔드만 개발
cd frontend && npm install && npm run dev

### 백엔드 테스트
cd backend && pytest -v
cd backend && pytest tests/test_api.py::test_name -v  # 단일 테스트

### 프론트엔드 빌드
cd frontend && npm run build

## Architecture

- `backend/app/main.py` — FastAPI 진입점, DB lifespan, WebSocket 라우트
- `backend/app/api/routes.py` — REST API (/api/extract, /api/downloads)
- `backend/app/core/downloader.py` — yt-dlp 래퍼 (VideoExtractor, DownloadManager)
- `backend/app/core/database.py` — SQLite async 래퍼 (Database 클래스)
- `backend/app/ws/progress.py` — WebSocket 브로드캐스트
- `frontend/src/api/client.ts` — fetch 기반 API 클라이언트
- `frontend/src/hooks/useWebSocket.ts` — 진행률 WebSocket 훅

## Key Patterns

- yt-dlp는 동기 라이브러리이므로 `run_in_executor`로 async 래핑
- 다운로드는 FastAPI BackgroundTasks로 비동기 실행
- WebSocket으로 진행률을 프론트엔드에 실시간 push
- 프론트엔드 Vite dev 서버는 `/api`와 `/ws`를 백엔드로 프록시
- Docker 프로덕션에서는 nginx가 프론트엔드 서빙 + 백엔드 프록시
```

**Step 3: 커밋**

```bash
git add CLAUDE.md .gitignore
git commit -m "docs: update CLAUDE.md with full architecture, add .gitignore"
```
