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
