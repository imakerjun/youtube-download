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
