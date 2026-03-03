import type { Download } from "../api/types";
import { ProgressBar } from "./ProgressBar";

interface Props {
  downloads: Download[];
}

const statusLabel: Record<string, string> = {
  pending: "대기",
  downloading: "다운로드 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
};

export function DownloadList({ downloads }: Props) {
  if (downloads.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-medium">다운로드 목록</h2>
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium">{dl.title}</p>
              <p className="text-xs text-gray-500">{dl.channel}</p>
            </div>
            <span className="text-xs text-gray-400">
              {statusLabel[dl.status] || dl.status}
            </span>
          </div>
          {(dl.status === "downloading" || dl.status === "pending") && (
            <ProgressBar progress={dl.progress} status={dl.status} />
          )}
          {dl.status === "failed" && dl.error_message && (
            <p className="text-xs text-red-400">{dl.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
