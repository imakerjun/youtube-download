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
