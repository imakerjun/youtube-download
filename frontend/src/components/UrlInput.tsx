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
