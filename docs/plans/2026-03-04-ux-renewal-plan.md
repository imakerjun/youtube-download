# UX Renewal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the YouTube Downloader from MVP to polished app with improved input, rich download cards, download management, and visual feedback.

**Architecture:** Keep existing single-page React + FastAPI architecture. Add 3 new backend endpoints (delete, retry, clear-completed). Extend WebSocket messages with speed/ETA. Rewrite all 4 frontend components with enhanced UX. Add 3 new components (Toast, EmptyState, Skeleton). Pure Tailwind CSS animations — no new dependencies.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, FastAPI, SQLite, WebSocket

---

### Task 1: Backend — Add speed/ETA to WebSocket progress + delete/retry/clear APIs

**Files:**
- Modify: `backend/app/core/downloader.py:79-84` (progress hook to include speed/ETA)
- Modify: `backend/app/api/routes.py:84-119` (progress callback to forward speed/ETA)
- Modify: `backend/app/ws/progress.py` (broadcast with speed/ETA)
- Modify: `backend/app/api/routes.py` (add delete, retry, clear-completed endpoints)
- Modify: `backend/app/core/database.py` (add delete_download, clear_completed)
- Test: `backend/tests/test_api.py`

**Step 1: Write failing tests for new endpoints**

Add to `backend/tests/test_api.py`:

```python
@pytest.mark.anyio
async def test_delete_download(client, test_db):
    # Create a download first
    dl_id = await test_db.create_download(
        url="https://youtube.com/watch?v=test",
        video_id="test", title="Test", channel="Ch",
        duration=60, thumbnail_url="", format_id="22",
    )
    resp = await client.delete(f"/api/downloads/{dl_id}/delete")
    assert resp.status_code == 200
    # Verify it's gone
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

    with patch("app.api.routes.extractor") as mock_ext:
        mock_ext.extract = AsyncMock(return_value={
            "is_playlist": False, "video_id": "retry",
            "title": "Retry Test", "channel": "Ch",
            "duration": 60, "thumbnail_url": "", "formats": [],
        })
        resp = await client.post(f"/api/downloads/{dl_id}/retry")

    assert resp.status_code == 200
    dl = await test_db.get_download(dl_id)
    assert dl["status"] == "pending"
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
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_api.py::test_delete_download tests/test_api.py::test_retry_download tests/test_api.py::test_clear_completed -v`
Expected: FAIL (404/405 — endpoints don't exist)

**Step 3: Implement database methods**

Add to `backend/app/core/database.py`:

```python
async def delete_download(self, download_id: int) -> bool:
    cursor = await self.db.execute(
        "DELETE FROM downloads WHERE id = ?", (download_id,)
    )
    await self.db.commit()
    return cursor.rowcount > 0

async def clear_completed(self) -> int:
    cursor = await self.db.execute(
        "DELETE FROM downloads WHERE status = 'completed'"
    )
    await self.db.commit()
    return cursor.rowcount
```

**Step 4: Implement API endpoints**

Add to `backend/app/api/routes.py` (before `run_download` function):

```python
@router.delete("/downloads/completed")
async def clear_completed_downloads():
    count = await db.clear_completed()
    return {"deleted": count}

@router.delete("/downloads/{download_id}/delete")
async def delete_download(download_id: int):
    download = await db.get_download(download_id)
    if not download:
        raise HTTPException(404, "Download not found")
    await db.delete_download(download_id)
    return {"status": "deleted"}

@router.post("/downloads/{download_id}/retry")
async def retry_download(download_id: int, background_tasks: BackgroundTasks):
    download = await db.get_download(download_id)
    if not download:
        raise HTTPException(404, "Download not found")
    if download["status"] not in ("failed", "cancelled"):
        raise HTTPException(400, "Can only retry failed or cancelled downloads")
    await db.update_download(download_id, status="pending", progress=0, error_message=None)
    background_tasks.add_task(run_download, download_id, download["url"], download["format_id"])
    updated = await db.get_download(download_id)
    return updated
```

**Important:** The `clear_completed` route MUST be defined before `{download_id}` routes to avoid FastAPI treating "completed" as a download_id.

**Step 5: Add speed/ETA to progress hook**

Modify `backend/app/core/downloader.py` — update the `hook` function inside `_download_sync`:

```python
def hook(d):
    if d["status"] == "downloading" and progress_callback:
        total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
        downloaded = d.get("downloaded_bytes", 0)
        pct = (downloaded / total * 100) if total else 0
        speed = d.get("speed") or 0  # bytes/sec
        eta = d.get("eta") or 0  # seconds
        progress_callback(pct, speed, eta)
    elif d["status"] == "finished":
        result["file_path"] = d.get("filename", "")
        result["file_size"] = d.get("total_bytes", 0)
```

Update `progress_callback` type signature in `DownloadManager.download` and `_download_sync`:

```python
progress_callback: Callable[[float, float, int], None] | None = None,
```

Update `backend/app/api/routes.py` — `run_download` and `_update_progress`:

```python
def on_progress(pct: float, speed: float, eta: int):
    loop.call_soon_threadsafe(
        asyncio.ensure_future,
        _update_progress(download_id, pct, speed, eta)
    )

async def _update_progress(download_id: int, pct: float, speed: float = 0, eta: int = 0):
    from app.ws.progress import broadcast_progress
    await db.update_download(download_id, progress=pct)
    await broadcast_progress(download_id, pct, "downloading", speed, eta)
```

Update `backend/app/ws/progress.py`:

```python
async def broadcast_progress(download_id: int, progress: float, status: str,
                             speed: float = 0, eta: int = 0):
    message = {
        "download_id": download_id,
        "progress": progress,
        "status": status,
        "speed": speed,
        "eta": eta,
    }
    dead = set()
    for ws in connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    connections.difference_update(dead)
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_api.py -v`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): add delete/retry/clear APIs, speed/ETA in progress"
```

---

### Task 2: Frontend — Update types and API client

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`

**Step 1: Update TypeScript types**

Replace `frontend/src/api/types.ts`:

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
  speed: number;
  eta: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProgressMessage {
  download_id: number;
  progress: number;
  status: string;
  speed: number;
  eta: number;
}
```

**Step 2: Update API client with new endpoints**

Replace `frontend/src/api/client.ts`:

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

  deleteDownload: (id: number) =>
    fetchJSON<{ status: string }>(`/downloads/${id}/delete`, { method: "DELETE" }),

  retryDownload: (id: number) =>
    fetchJSON<Download>(`/downloads/${id}/retry`, { method: "POST" }),

  clearCompleted: () =>
    fetchJSON<{ deleted: number }>("/downloads/completed", { method: "DELETE" }),

  openFolder: () =>
    fetchJSON<{ path: string }>("/downloads/open-folder", { method: "POST" }),
};
```

**Step 3: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(frontend): update types and API client for new endpoints"
```

---

### Task 3: Frontend — Create utility modules (error mapping, formatters)

**Files:**
- Create: `frontend/src/utils/errorMessages.ts`
- Create: `frontend/src/utils/format.ts`

**Step 1: Create error message mapping**

Create `frontend/src/utils/errorMessages.ts`:

```typescript
const errorMap: [RegExp, string][] = [
  [/ThreadPoolExecutor/i, "다운로드 처리 중 오류가 발생했습니다. 다시 시도해주세요."],
  [/network/i, "네트워크 연결을 확인해주세요."],
  [/not found|404/i, "영상을 찾을 수 없습니다. URL을 확인해주세요."],
  [/private|unavailable/i, "비공개이거나 이용할 수 없는 영상입니다."],
  [/age/i, "연령 제한 영상은 다운로드할 수 없습니다."],
  [/copyright|blocked/i, "저작권으로 인해 다운로드할 수 없습니다."],
  [/format/i, "선택한 포맷을 사용할 수 없습니다. 다른 포맷을 선택해주세요."],
  [/timeout/i, "요청 시간이 초과되었습니다. 다시 시도해주세요."],
];

export function friendlyError(raw: string | null): string {
  if (!raw) return "알 수 없는 오류가 발생했습니다.";
  for (const [pattern, message] of errorMap) {
    if (pattern.test(raw)) return message;
  }
  return raw.length > 100 ? "다운로드 중 오류가 발생했습니다." : raw;
}
```

**Step 2: Create formatting utilities**

Create `frontend/src/utils/format.ts`:

```typescript
export function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return "";
  const mb = bytesPerSec / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(isoString: string | null): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
```

**Step 3: Commit**

```bash
git add frontend/src/utils/
git commit -m "feat(frontend): add error mapping and formatting utilities"
```

---

### Task 4: Frontend — Create Toast notification component

**Files:**
- Create: `frontend/src/components/Toast.tsx`

**Step 1: Create Toast component**

Create `frontend/src/components/Toast.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let addToastFn: ((message: string, type: ToastItem["type"]) => void) | null = null;

export function toast(message: string, type: ToastItem["type"] = "info") {
  addToastFn?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem["type"]) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-3 text-sm shadow-lg animate-slide-in
            ${t.type === "success" ? "bg-green-900/90 text-green-200 border border-green-700" : ""}
            ${t.type === "error" ? "bg-red-900/90 text-red-200 border border-red-700" : ""}
            ${t.type === "info" ? "bg-gray-800/90 text-gray-200 border border-gray-600" : ""}
          `}
        >
          <span className="mr-2">
            {t.type === "success" && "✓"}
            {t.type === "error" && "✗"}
            {t.type === "info" && "ℹ"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Add animation to Tailwind — add to `frontend/src/index.css`**

```css
@import "tailwindcss";

@keyframes slide-in {
  from { opacity: 0; transform: translateX(1rem); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@utility animate-slide-in {
  animation: slide-in 0.3s ease-out;
}

@utility animate-fade-in-up {
  animation: fade-in-up 0.3s ease-out;
}

@utility animate-shimmer {
  background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.05) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/Toast.tsx frontend/src/index.css
git commit -m "feat(frontend): add Toast notification component with animations"
```

---

### Task 5: Frontend — Rewrite UrlInput component

**Files:**
- Modify: `frontend/src/components/UrlInput.tsx`

**Step 1: Rewrite UrlInput with single input + paste button + collapsible multi-URL**

Replace `frontend/src/components/UrlInput.tsx`:

```tsx
import { useState } from "react";

interface Props {
  onSubmit: (urls: string[]) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [input, setInput] = useState("");
  const [showMulti, setShowMulti] = useState(false);
  const [multiInput, setMultiInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showMulti && multiInput.trim()) {
      const urls = multiInput.split("\n").map((u) => u.trim()).filter(Boolean);
      if (urls.length > 0) onSubmit(urls);
    } else if (input.trim()) {
      onSubmit([input.trim()]);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(text.trim());
    } catch {
      // clipboard permission denied — ignore
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!showMulti && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="YouTube URL을 붙여넣으세요"
            className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm
                       placeholder-gray-500 focus:border-blue-500 focus:outline-none
                       transition-colors"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5
                       text-gray-400 hover:text-gray-200 hover:border-gray-500
                       transition-colors"
            title="클립보드에서 붙여넣기"
          >
            📋
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium
                       hover:bg-blue-500 active:scale-[0.98]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
          >
            {loading ? "분석 중..." : "다운로드"}
          </button>
        </div>
      )}

      {showMulti && (
        <>
          <textarea
            value={multiInput}
            onChange={(e) => setMultiInput(e.target.value)}
            placeholder="여러 YouTube URL을 줄바꿈으로 구분하여 입력하세요"
            className="w-full rounded-lg bg-gray-900 border border-gray-700 p-3 text-sm
                       placeholder-gray-500 focus:border-blue-500 focus:outline-none
                       resize-y min-h-[100px] transition-colors"
            rows={4}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !multiInput.trim()}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium
                         hover:bg-blue-500 active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all"
            >
              {loading ? "분석 중..." : "일괄 다운로드"}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowMulti(!showMulti)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        {showMulti ? "← 단일 URL 입력" : "여러 URL 한번에 입력 →"}
      </button>
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/UrlInput.tsx
git commit -m "feat(frontend): rewrite UrlInput with single input + paste + collapsible multi"
```

---

### Task 6: Frontend — Rewrite FormatSelector component

**Files:**
- Modify: `frontend/src/components/FormatSelector.tsx`

**Step 1: Rewrite FormatSelector with larger thumbnail, audio-only option, inline style**

Replace `frontend/src/components/FormatSelector.tsx`:

```tsx
import type { VideoInfo } from "../api/types";
import { formatSize, formatDuration } from "../utils/format";

interface Props {
  info: VideoInfo;
  onSelect: (formatId: string) => void;
  onCancel: () => void;
}

export function FormatSelector({ info, onSelect, onCancel }: Props) {
  const videoFormats = info.formats.filter(
    (f) => f.resolution && f.resolution !== "audio only"
  );
  const audioFormats = info.formats.filter(
    (f) => f.resolution === "audio only" || f.vcodec === "none"
  );

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 animate-fade-in-up">
      {/* Video info header */}
      <div className="flex gap-4">
        {info.thumbnail_url && (
          <img
            src={info.thumbnail_url}
            alt=""
            className="w-40 h-auto rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0">
          <h3 className="font-medium leading-snug line-clamp-2">{info.title}</h3>
          <p className="text-sm text-gray-400 mt-1">{info.channel}</p>
          {info.duration > 0 && (
            <p className="text-xs text-gray-500 mt-1">{formatDuration(info.duration)}</p>
          )}
        </div>
      </div>

      {/* Format selection */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">화질 선택</h4>

        {/* Best quality button */}
        <button
          onClick={() => onSelect("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")}
          className="w-full flex items-center justify-between rounded-lg bg-blue-600 px-4 py-3
                     text-sm font-medium hover:bg-blue-500 active:scale-[0.99] transition-all"
        >
          <span>🎬 최고 화질로 다운로드</span>
        </button>

        {/* Video formats */}
        <div className="space-y-1">
          {videoFormats.map((f) => (
            <button
              key={f.format_id}
              onClick={() => onSelect(f.format_id)}
              className="w-full flex justify-between items-center rounded-lg px-4 py-2.5
                         text-sm hover:bg-gray-800 transition-colors"
            >
              <span>
                {f.resolution}
                <span className="text-gray-500 ml-2">{f.ext}</span>
              </span>
              <span className="text-gray-400">{formatSize(f.filesize)}</span>
            </button>
          ))}
        </div>

        {/* Audio only */}
        {audioFormats.length > 0 && (
          <>
            <div className="border-t border-gray-800 pt-2">
              <button
                onClick={() => onSelect("bestaudio[ext=m4a]/bestaudio/best")}
                className="w-full flex justify-between items-center rounded-lg px-4 py-2.5
                           text-sm hover:bg-gray-800 transition-colors"
              >
                <span>🎵 오디오만 (최고 음질)</span>
                <span className="text-gray-400">
                  {formatSize(audioFormats[0]?.filesize)}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        취소
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/FormatSelector.tsx
git commit -m "feat(frontend): rewrite FormatSelector with larger thumbnail and audio option"
```

---

### Task 7: Frontend — Rewrite DownloadList and ProgressBar

**Files:**
- Modify: `frontend/src/components/DownloadList.tsx`
- Modify: `frontend/src/components/ProgressBar.tsx`
- Create: `frontend/src/components/EmptyState.tsx`

**Step 1: Create EmptyState component**

Create `frontend/src/components/EmptyState.tsx`:

```tsx
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-4 opacity-30">⬇</div>
      <p className="text-gray-400 text-sm">아직 다운로드가 없습니다</p>
      <p className="text-gray-600 text-xs mt-1">
        YouTube URL을 입력하면 여기에 표시됩니다
      </p>
    </div>
  );
}
```

**Step 2: Rewrite ProgressBar with speed/ETA**

Replace `frontend/src/components/ProgressBar.tsx`:

```tsx
import { formatSpeed, formatEta } from "../utils/format";

interface Props {
  progress: number;
  status: string;
  speed?: number;
  eta?: number;
}

export function ProgressBar({ progress, status, speed = 0, eta = 0 }: Props) {
  const color =
    status === "completed" ? "bg-green-500" :
    status === "failed" ? "bg-red-500" :
    "bg-blue-500";

  const pct = Math.min(progress, 100);

  return (
    <div className="space-y-1">
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{pct.toFixed(0)}%</span>
        <span>
          {speed > 0 && formatSpeed(speed)}
          {speed > 0 && eta > 0 && " · "}
          {eta > 0 && `남은 시간 ${formatEta(eta)}`}
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Rewrite DownloadList with actions, thumbnails, status icons**

Replace `frontend/src/components/DownloadList.tsx`:

```tsx
import type { Download } from "../api/types";
import { api } from "../api/client";
import { ProgressBar } from "./ProgressBar";
import { EmptyState } from "./EmptyState";
import { friendlyError } from "../utils/errorMessages";
import { formatSize, timeAgo } from "../utils/format";

interface Props {
  downloads: Download[];
  onUpdate: () => void;
}

const statusIcon: Record<string, string> = {
  pending: "⏳",
  downloading: "⬇",
  completed: "✓",
  failed: "✗",
  cancelled: "⊘",
};

const statusColor: Record<string, string> = {
  pending: "text-gray-400",
  downloading: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
  cancelled: "text-gray-500",
};

export function DownloadList({ downloads, onUpdate }: Props) {
  if (downloads.length === 0) return <EmptyState />;

  const hasCompleted = downloads.some((dl) => dl.status === "completed");

  const handleDelete = async (id: number) => {
    await api.deleteDownload(id);
    onUpdate();
  };

  const handleRetry = async (id: number) => {
    await api.retryDownload(id);
    onUpdate();
  };

  const handleClearCompleted = async () => {
    await api.clearCompleted();
    onUpdate();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium text-gray-400">다운로드 목록</h2>
        <div className="flex gap-3">
          {hasCompleted && (
            <button
              onClick={handleClearCompleted}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              완료 항목 정리
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={() => api.openFolder()}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              폴더 열기
            </button>
          )}
        </div>
      </div>

      {/* Download items */}
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2
                     animate-fade-in-up"
        >
          <div className="flex gap-3">
            {/* Thumbnail */}
            {dl.thumbnail_url && (
              <img
                src={dl.thumbnail_url}
                alt=""
                className="w-16 h-12 rounded object-cover flex-shrink-0"
              />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{dl.title}</p>
                  <p className="text-xs text-gray-500">{dl.channel}</p>
                </div>

                {/* Status + actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs ${statusColor[dl.status] || "text-gray-400"}`}>
                    {statusIcon[dl.status] || ""}{" "}
                    {dl.status === "completed" && dl.file_size
                      ? formatSize(dl.file_size)
                      : ""}
                    {dl.status === "completed" && dl.completed_at
                      ? ` · ${timeAgo(dl.completed_at)}`
                      : ""}
                  </span>

                  {/* Retry button */}
                  {(dl.status === "failed" || dl.status === "cancelled") && (
                    <button
                      onClick={() => handleRetry(dl.id)}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title="재시도"
                    >
                      ⟳
                    </button>
                  )}

                  {/* Delete button */}
                  {dl.status !== "downloading" && (
                    <button
                      onClick={() => handleDelete(dl.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="삭제"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {(dl.status === "downloading" || dl.status === "pending") && (
            <ProgressBar
              progress={dl.progress}
              status={dl.status}
              speed={dl.speed}
              eta={dl.eta}
            />
          )}

          {/* Error message */}
          {dl.status === "failed" && dl.error_message && (
            <p className="text-xs text-red-400">{friendlyError(dl.error_message)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(frontend): rewrite DownloadList with actions, EmptyState, enhanced ProgressBar"
```

---

### Task 8: Frontend — Create Skeleton loader and update App.tsx

**Files:**
- Create: `frontend/src/components/Skeleton.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create Skeleton component**

Create `frontend/src/components/Skeleton.tsx`:

```tsx
export function VideoSkeleton() {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 animate-pulse">
      <div className="flex gap-4">
        <div className="w-40 h-24 rounded-lg bg-gray-800 animate-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-800 rounded w-3/4 animate-shimmer" />
          <div className="h-3 bg-gray-800 rounded w-1/2 animate-shimmer" />
          <div className="h-3 bg-gray-800 rounded w-1/4 animate-shimmer" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-10 bg-gray-800 rounded-lg animate-shimmer" />
        <div className="h-8 bg-gray-800 rounded-lg animate-shimmer" />
        <div className="h-8 bg-gray-800 rounded-lg animate-shimmer" />
      </div>
    </div>
  );
}
```

**Step 2: Rewrite App.tsx to integrate all components**

Replace `frontend/src/App.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { api } from "./api/client";
import type { Download, VideoInfo } from "./api/types";
import { useProgressWebSocket } from "./hooks/useWebSocket";
import { UrlInput } from "./components/UrlInput";
import { FormatSelector } from "./components/FormatSelector";
import { DownloadList } from "./components/DownloadList";
import { VideoSkeleton } from "./components/Skeleton";
import { ToastContainer, toast } from "./components/Toast";
import { friendlyError } from "./utils/errorMessages";

function App() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
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
      prev.map((dl) => {
        if (dl.id !== msg.download_id) return dl;
        const updated = {
          ...dl,
          progress: msg.progress,
          status: msg.status as Download["status"],
          speed: msg.speed ?? 0,
          eta: msg.eta ?? 0,
        };
        // Toast on completion or failure
        if (msg.status === "completed" && dl.status !== "completed") {
          toast(`"${dl.title}" 다운로드 완료`, "success");
        }
        if (msg.status === "failed" && dl.status !== "failed") {
          toast(`"${dl.title}" 다운로드 실패`, "error");
        }
        return updated;
      })
    );
  });

  const handleUrls = async (urls: string[]) => {
    setError("");

    if (urls.length === 1) {
      setLoading(true);
      try {
        const info = await api.extract(urls[0]);
        if (info.is_playlist) {
          setError("재생목록 지원은 추후 추가 예정입니다.");
        } else {
          setVideoInfo(info as VideoInfo);
        }
      } catch (e: any) {
        setError(friendlyError(e.message));
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        for (const url of urls) {
          await api.createDownload(url, "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
        }
        toast(`${urls.length}개 다운로드가 시작되었습니다`, "info");
        await loadDownloads();
      } catch (e: any) {
        setError(friendlyError(e.message));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFormatSelect = async (formatId: string) => {
    try {
      await api.createDownload(videoInfo!.video_id ? `https://youtube.com/watch?v=${videoInfo!.video_id}` : "", formatId);
      setVideoInfo(null);
      toast("다운로드가 시작되었습니다", "info");
      await loadDownloads();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">YouTube Downloader</h1>
      </header>
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <UrlInput onSubmit={handleUrls} loading={loading} />

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/50 px-4 py-3
                          text-sm text-red-300 animate-fade-in-up">
            {error}
          </div>
        )}

        {loading && !videoInfo && <VideoSkeleton />}

        {videoInfo && (
          <FormatSelector
            info={videoInfo}
            onSelect={handleFormatSelect}
            onCancel={() => setVideoInfo(null)}
          />
        )}

        <DownloadList downloads={downloads} onUpdate={loadDownloads} />
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
```

**Note about `handleFormatSelect`:** The original used `currentUrl` state. Now we derive the URL from `videoInfo.video_id`. However, check if the original URL is needed — if so, store it in `videoInfo` or keep a separate state. The simplest fix: keep a `currentUrl` state as before.

**Correction — keep `currentUrl` for format selection:**

```tsx
const [currentUrl, setCurrentUrl] = useState("");

// In handleUrls single-URL branch:
setVideoInfo(info as VideoInfo);
setCurrentUrl(urls[0]);

// In handleFormatSelect:
await api.createDownload(currentUrl, formatId);
setVideoInfo(null);
setCurrentUrl("");
```

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat(frontend): integrate all UX improvements into App with skeleton and toasts"
```

---

### Task 9: Frontend — Update WebSocket hook for speed/ETA

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts`

**Step 1: Update hook — no changes needed structurally**

The hook already parses `JSON.parse(event.data) as ProgressMessage`. Since we updated the `ProgressMessage` type in Task 2 to include `speed` and `eta`, the hook will automatically pick up the new fields. No code changes needed.

**Step 2: Verify by reading the file**

Confirm `useWebSocket.ts` uses `ProgressMessage` type and passes the full message object to the callback. ✓ Already correct.

**Step 3: Commit (skip — no changes)**

---

### Task 10: Manual verification — Run the full stack and test

**Step 1: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 2: Run backend tests**

Run: `cd backend && pytest -v`
Expected: ALL PASS

**Step 3: Start full stack and manual test**

Run: `docker compose up --build`

Manual verification checklist:
- [ ] Single URL input with paste button works
- [ ] Multi-URL toggle shows/hides textarea
- [ ] Skeleton appears during URL analysis
- [ ] FormatSelector shows large thumbnail, audio option
- [ ] Download progress shows speed and ETA
- [ ] Toast appears on download completion
- [ ] Retry button works for failed downloads
- [ ] Delete button removes download item
- [ ] "완료 항목 정리" clears completed downloads
- [ ] Empty state shows when no downloads exist
- [ ] Error messages are user-friendly Korean

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete UX renewal — input, cards, progress, toasts, management"
```
