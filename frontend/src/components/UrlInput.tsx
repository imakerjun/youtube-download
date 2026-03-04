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
