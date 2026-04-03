# YouTube Downloader

본인 전용 YouTube 영상 아카이빙 로컬 웹앱.

## 사전 요구사항

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose

## 실행

```bash
docker compose up --build
```

브라우저에서 http://localhost:3000 접속.

## 사용법

### 단일 영상 다운로드

1. YouTube URL을 입력창에 붙여넣기
2. **다운로드** 클릭
3. 포맷/화질 선택 (또는 "최고 화질로 다운로드")
4. 진행률 확인 후 완료

### 배치 다운로드

1. 여러 URL을 줄바꿈으로 구분하여 입력
2. **다운로드** 클릭 → 최고 화질로 순차 다운로드

### 재생목록/채널 다운로드

1. 재생목록 또는 채널 URL 입력
2. 영상 목록 확인 후 선택적 다운로드

## 다운로드 파일 위치

다운로드된 영상은 프로젝트 루트의 `downloads/` 폴더에 저장됩니다.

## 개발

### 백엔드 (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 프론트엔드 (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

### 테스트

```bash
cd backend && pytest -v
```

## 기술 스택

| 항목 | 기술 |
|------|------|
| 백엔드 | Python, FastAPI, yt-dlp |
| DB | SQLite |
| 프론트엔드 | React, Vite, Tailwind CSS |
| 실시간 통신 | WebSocket |
| 실행 환경 | Docker Compose |
