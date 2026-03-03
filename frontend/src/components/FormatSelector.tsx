import type { VideoInfo } from "../api/types";

interface Props {
  info: VideoInfo;
  onSelect: (formatId: string) => void;
  onCancel: () => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "N/A";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export function FormatSelector({ info, onSelect, onCancel }: Props) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
      <div className="flex gap-3">
        {info.thumbnail_url && (
          <img src={info.thumbnail_url} alt="" className="w-32 rounded" />
        )}
        <div>
          <h3 className="font-medium">{info.title}</h3>
          <p className="text-sm text-gray-400">{info.channel}</p>
        </div>
      </div>
      <div className="space-y-1">
        {info.formats
          .filter((f) => f.resolution && f.resolution !== "audio only")
          .map((f) => (
            <button
              key={f.format_id}
              onClick={() => onSelect(f.format_id)}
              className="w-full flex justify-between items-center rounded px-3 py-2
                         text-sm hover:bg-gray-800"
            >
              <span>{f.resolution} ({f.ext})</span>
              <span className="text-gray-400">{formatSize(f.filesize)}</span>
            </button>
          ))}
        <button
          onClick={() => onSelect("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")}
          className="w-full rounded px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 font-medium"
        >
          최고 화질로 다운로드
        </button>
      </div>
      <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-300">
        취소
      </button>
    </div>
  );
}
