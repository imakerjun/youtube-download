# YouTube Downloader - 설계 문서

## 목적

본인 전용 YouTube 영상 아카이빙 도구. 로컬 웹앱으로 구현하여 브라우저에서 URL을 붙여넣고 다운로드/관리한다.

## 아키텍처

```
Browser (React + Vite)
    │ REST API / WebSocket
Python Backend (FastAPI)
    ├── Download Manager (yt-dlp)
    └── History & Metadata (SQLite)
    │
Local Filesystem (볼륨 마운트)
```

## 기술 스택

| 항목 | 기술 |
|------|------|
| 백엔드 | Python + FastAPI |
| 다운로드 엔진 | yt-dlp (Python 라이브러리) |
| DB | SQLite |
| 프론트엔드 | React + Vite + Tailwind CSS |
| 실시간 통신 | WebSocket (진행률) |
| 실행 환경 | Docker Compose |

## 핵심 기능

### 1. 단일 URL 다운로드
- URL 입력 → yt-dlp로 사용 가능한 포맷/화질 조회 → 선택 → 다운로드
- 다운로드 진행률 WebSocket으로 실시간 표시

### 2. 배치 다운로드
- 여러 URL 한 번에 입력 (줄바꿈 구분)
- 대기열에 추가, 순차 처리
- 전체 진행 상황 대시보드

### 3. 재생목록/채널 다운로드
- 재생목록/채널 URL 입력 → 영상 목록 표시
- 전체 또는 선택적 다운로드

### 4. 다운로드 이력
- SQLite에 메타데이터 저장 (제목, 채널, 날짜, 썸네일 URL, 파일 경로 등)
- 이력 검색/조회 UI

## API 설계 (주요 엔드포인트)

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/downloads | 다운로드 요청 (단일/배치) |
| GET | /api/downloads | 다운로드 이력 조회 |
| GET | /api/downloads/:id | 단일 다운로드 상태/상세 |
| DELETE | /api/downloads/:id | 다운로드 취소 |
| POST | /api/extract | URL에서 영상 정보 추출 (포맷 목록 등) |
| WS | /ws/progress | 다운로드 진행률 실시간 스트림 |

## 데이터 모델

### downloads 테이블
- id (PK)
- url (원본 YouTube URL)
- video_id (YouTube video ID)
- title
- channel
- duration
- thumbnail_url
- format (선택한 포맷)
- file_path (저장된 파일 경로)
- file_size
- status (pending / downloading / completed / failed)
- progress (0-100)
- error_message
- created_at
- completed_at

## Docker Compose 구조

```
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    volumes:
      - ./downloads:/app/downloads
      - ./data:/app/data  # SQLite DB
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
```

## 디렉토리 구조

```
youtube-download/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 앱 진입점
│   │   ├── api/
│   │   │   └── routes.py    # API 라우트
│   │   ├── core/
│   │   │   ├── downloader.py # yt-dlp 래퍼
│   │   │   └── config.py     # 설정
│   │   ├── models/
│   │   │   └── download.py   # DB 모델
│   │   └── ws/
│   │       └── progress.py   # WebSocket 핸들러
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── docs/plans/
└── CLAUDE.md
```
