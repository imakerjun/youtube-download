import type { VideoInfo } from "../api/types";
import { formatSize, formatDuration } from "../utils/format";

interface Props {
  info: VideoInfo;
  onSelect: (formatId: string) => void;
  onCancel: () => void;
}

export function FormatSelector({ info, onSelect, onCancel }: Props) {
  const videoFormats = info.formats.filter(
    (f) => f.resolution && f.resolution !== "audio only"
  );
  const audioFormats = info.formats.filter(
    (f) => f.resolution === "audio only" || f.vcodec === "none"
  );

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 animate-fade-in-up">
      {/* Video info header */}
      <div className="flex gap-4">
        {info.thumbnail_url && (
          <img
            src={info.thumbnail_url}
            alt=""
            className="w-40 h-auto rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0">
          <h3 className="font-medium leading-snug line-clamp-2">{info.title}</h3>
          <p className="text-sm text-gray-400 mt-1">{info.channel}</p>
          {info.duration > 0 && (
            <p className="text-xs text-gray-500 mt-1">{formatDuration(info.duration)}</p>
          )}
        </div>
      </div>

      {/* Format selection */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">화질 선택</h4>

        {/* Best quality button */}
        <button
          onClick={() => onSelect("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")}
          className="w-full flex items-center justify-between rounded-lg bg-blue-600 px-4 py-3
                     text-sm font-medium hover:bg-blue-500 active:scale-[0.99] transition-all"
        >
          <span>🎬 최고 화질로 다운로드</span>
        </button>

        {/* Video formats */}
        <div className="space-y-1">
          {videoFormats.map((f) => (
            <button
              key={f.format_id}
              onClick={() => onSelect(f.format_id)}
              className="w-full flex justify-between items-center rounded-lg px-4 py-2.5
                         text-sm hover:bg-gray-800 transition-colors"
            >
              <span>
                {f.resolution}
                <span className="text-gray-500 ml-2">{f.ext}</span>
              </span>
              <span className="text-gray-400">{formatSize(f.filesize)}</span>
            </button>
          ))}
        </div>

        {/* Audio only */}
        {audioFormats.length > 0 && (
          <div className="border-t border-gray-800 pt-2">
            <button
              onClick={() => onSelect("bestaudio[ext=m4a]/bestaudio/best")}
              className="w-full flex justify-between items-center rounded-lg px-4 py-2.5
                         text-sm hover:bg-gray-800 transition-colors"
            >
              <span>🎵 오디오만 (최고 음질)</span>
              <span className="text-gray-400">
                {formatSize(audioFormats[0]?.filesize)}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        취소
      </button>
    </div>
  );
}
