# 플레이리스트/채널 일괄 다운로드 설계

## 목표

YouTube 채널 전체 영상 또는 플레이리스트의 영상을 목록으로 미리보고, 선택하여 일괄 다운로드하는 기능 추가.

## 현재 상태

- `VideoExtractor`가 이미 플레이리스트 파싱 지원 (`_type == "playlist"` 감지)
- 하지만 `routes.py`에서 400 에러로 차단, 프론트엔드에서도 "추후 추가" 메시지로 막고 있음
- yt-dlp는 채널 URL을 자동으로 플레이리스트로 변환하므로 별도 처리 불필요

## 설계

### 백엔드

1. `routes.py`의 플레이리스트 400 에러 제거
2. `POST /api/downloads/batch` 엔드포인트 추가
   - 입력: `{urls: string[], format_id: string}`
   - 각 URL에 대해 extract → create_download → background download
   - 응답: 생성된 Download 목록

### 프론트엔드

1. `PlaylistSelector` 컴포넌트 신규 생성
   - 영상 목록을 체크박스와 함께 표시 (썸네일, 제목, 길이)
   - 전체선택/해제 버튼
   - 포맷 선택 (기본: best mp4)
   - "선택 다운로드" 버튼
2. `App.tsx` 수정
   - `is_playlist`일 때 `PlaylistSelector` 렌더링 (기존 `FormatSelector` 대신)
3. `api/client.ts`에 `batchDownload` 메서드 추가

### 데이터 흐름

```
사용자 URL 입력 → extract API → is_playlist?
  ├─ No → FormatSelector (기존 동작)
  └─ Yes → PlaylistSelector (영상 목록 표시)
            → 사용자 선택 → batch download API
            → 개별 다운로드 작업으로 큐에 추가
            → WebSocket으로 각 영상 진행률 전송
```
