# 플레이리스트/채널 일괄 다운로드 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** YouTube 채널/플레이리스트 URL 입력 시 영상 목록을 미리보고, 선택한 영상들을 원하는 포맷으로 일괄 다운로드하는 기능 추가.

**Architecture:** 백엔드에 `/api/downloads/batch` 엔드포인트 추가하여 여러 URL을 한번에 다운로드 큐에 등록. 프론트엔드에 `PlaylistSelector` 컴포넌트 추가하여 영상 목록 체크박스 선택 + 포맷 선택 UI 제공. 기존 extract → select → download 흐름을 그대로 따름.

**Tech Stack:** FastAPI, yt-dlp, React, TypeScript, Tailwind CSS

---

### Task 1: 백엔드 — 플레이리스트 차단 제거 및 batch 엔드포인트 추가

**Files:**
- Modify: `backend/app/api/routes.py:17-22` (모델 추가), `:33-34` (차단 제거)
- Test: `backend/tests/test_api.py`

**Step 1: 테스트 작성**

`backend/tests/test_api.py` 파일 끝에 추가:

```python
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
```

**Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && pytest tests/test_api.py::test_batch_download tests/test_api.py::test_extract_playlist -v`
Expected: `test_batch_download` → 404 (엔드포인트 없음), `test_extract_playlist` → 400 (차단)

**Step 3: 구현**

`backend/app/api/routes.py`에서:

1. `BatchDownloadRequest` 모델 추가 (DownloadRequest 아래):
```python
class BatchDownloadRequest(BaseModel):
    urls: list[str]
    format_id: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
```

2. `create_download` 함수에서 플레이리스트 차단 코드 삭제 (33-34줄):
```python
    if info.get("is_playlist"):
        raise HTTPException(400, "Use /api/extract first for playlists")
```

3. batch 엔드포인트 추가 (`create_download` 함수 뒤):
```python
@router.post("/downloads/batch", status_code=201)
async def batch_download(req: BatchDownloadRequest, background_tasks: BackgroundTasks):
    downloads = []
    for url in req.urls:
        info = await extractor.extract(url)
        if info.get("is_playlist"):
            continue  # 개별 영상 URL만 처리
        download_id = await db.create_download(
            url=url,
            video_id=info["video_id"],
            title=info["title"],
            channel=info["channel"],
            duration=info["duration"],
            thumbnail_url=info["thumbnail_url"],
            format_id=req.format_id,
        )
        background_tasks.add_task(run_download, download_id, url, req.format_id)
        download = await db.get_download(download_id)
        downloads.append(download)
    return downloads
```

**Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && pytest tests/test_api.py -v`
Expected: 모든 테스트 PASS

**Step 5: 커밋**

```bash
git add backend/app/api/routes.py backend/tests/test_api.py
git commit -m "feat(backend): add batch download endpoint and allow playlist extract"
```

---

### Task 2: 프론트엔드 — API 클라이언트 및 타입 확장

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`

**Step 1: 타입에 PlaylistEntry에 url 필드 추가**

`frontend/src/api/types.ts`의 `PlaylistEntry`에 선택적 url 필드 추가:

```typescript
export interface PlaylistEntry {
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
}
```

(기존과 동일 — 변경 없음. video_id로 URL 생성 가능)

**Step 2: API 클라이언트에 batchDownload 추가**

`frontend/src/api/client.ts`의 `api` 객체에 추가:

```typescript
  batchDownload: (urls: string[], format_id: string) =>
    fetchJSON<Download[]>("/downloads/batch", {
      method: "POST",
      body: JSON.stringify({ urls, format_id }),
    }),
```

**Step 3: 커밋**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add batchDownload API method"
```

---

### Task 3: 프론트엔드 — PlaylistSelector 컴포넌트

**Files:**
- Create: `frontend/src/components/PlaylistSelector.tsx`

**Step 1: 컴포넌트 생성**

```tsx
import { useState } from "react";
import type { PlaylistInfo, PlaylistEntry } from "../api/types";
import { formatDuration } from "../utils/format";

interface Props {
  info: PlaylistInfo;
  onDownload: (entries: PlaylistEntry[], formatId: string) => void;
  onCancel: () => void;
}

export function PlaylistSelector({ info, onDownload, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(info.entries.map((_, i) => i))
  );
  const [formatId, setFormatId] = useState(
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
  );

  const toggleAll = () => {
    if (selected.size === info.entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(info.entries.map((_, i) => i)));
    }
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleDownload = () => {
    const entries = info.entries.filter((_, i) => selected.has(i));
    if (entries.length > 0) onDownload(entries, formatId);
  };

  const totalDuration = info.entries
    .filter((_, i) => selected.has(i))
    .reduce((sum, e) => sum + (e.duration || 0), 0);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 animate-fade-in-up">
      {/* Header */}
      <div>
        <h3 className="font-medium leading-snug">{info.title}</h3>
        <p className="text-sm text-gray-400 mt-1">
          {info.entries.length}개 영상 · {selected.size}개 선택
          {totalDuration > 0 && ` · 총 ${formatDuration(totalDuration)}`}
        </p>
      </div>

      {/* Select all */}
      <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
        <button
          onClick={toggleAll}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {selected.size === info.entries.length ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      {/* Entry list */}
      <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
        {info.entries.map((entry, i) => (
          <label
            key={entry.video_id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer
                       transition-colors ${
                         selected.has(i)
                           ? "bg-gray-800/70"
                           : "hover:bg-gray-800/40"
                       }`}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggle(i)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500
                         focus:ring-blue-500 focus:ring-offset-0"
            />
            {entry.thumbnail_url && (
              <img
                src={entry.thumbnail_url}
                alt=""
                className="w-20 h-auto rounded flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug line-clamp-1">{entry.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {entry.channel}
                {entry.duration > 0 && ` · ${formatDuration(entry.duration)}`}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Format selector */}
      <div className="border-t border-gray-800 pt-3 space-y-2">
        <h4 className="text-sm font-medium text-gray-300">화질</h4>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", label: "최고 화질" },
            { id: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]", label: "1080p" },
            { id: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]", label: "720p" },
            { id: "bestaudio[ext=m4a]/bestaudio/best", label: "오디오만" },
          ].map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setFormatId(fmt.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                formatId === fmt.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleDownload}
          disabled={selected.size === 0}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium
                     hover:bg-blue-500 active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all"
        >
          {selected.size}개 다운로드
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add frontend/src/components/PlaylistSelector.tsx
git commit -m "feat(frontend): add PlaylistSelector component"
```

---

### Task 4: 프론트엔드 — App.tsx에서 PlaylistSelector 연결

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: 구현**

`App.tsx` 변경사항:

1. import 추가:
```typescript
import type { Download, VideoInfo, PlaylistInfo, PlaylistEntry } from "./api/types";
import { PlaylistSelector } from "./components/PlaylistSelector";
```

2. state 추가:
```typescript
const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
```

3. `handleUrls` 함수에서 플레이리스트 차단 대신 playlistInfo 설정:
```typescript
if (info.is_playlist) {
  setPlaylistInfo(info as PlaylistInfo);
} else {
```

4. `handlePlaylistDownload` 함수 추가:
```typescript
const handlePlaylistDownload = async (entries: PlaylistEntry[], formatId: string) => {
  try {
    const urls = entries.map(
      (e) => `https://www.youtube.com/watch?v=${e.video_id}`
    );
    await api.batchDownload(urls, formatId);
    setPlaylistInfo(null);
    toast(`${entries.length}개 다운로드가 시작되었습니다`, "info");
    await loadDownloads();
  } catch (e: any) {
    setError(friendlyError(e.message));
  }
};
```

5. JSX에 PlaylistSelector 렌더링 추가 (FormatSelector 바로 뒤):
```tsx
{playlistInfo && (
  <PlaylistSelector
    info={playlistInfo}
    onDownload={handlePlaylistDownload}
    onCancel={() => setPlaylistInfo(null)}
  />
)}
```

**Step 2: 커밋**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): connect PlaylistSelector to App"
```

---

### Task 5: 수동 통합 테스트

**Step 1: Docker 빌드 및 실행**

Run: `docker compose up --build`

**Step 2: 테스트 시나리오**

1. 단일 영상 URL → 기존 FormatSelector 동작 확인
2. 플레이리스트 URL (예: `https://www.youtube.com/playlist?list=...`) → PlaylistSelector 표시 확인
3. 영상 선택/해제/전체선택 동작 확인
4. 포맷 선택 후 다운로드 시작 확인
5. 다운로드 진행률이 각 영상별로 표시되는지 확인

**Step 3: 최종 커밋**

```bash
git add -A
git commit -m "feat: add playlist/channel batch download support"
```
