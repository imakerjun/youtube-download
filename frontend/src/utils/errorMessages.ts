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
