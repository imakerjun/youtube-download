import type { Download } from "../api/types";
import { api } from "../api/client";
import { ProgressBar } from "./ProgressBar";
import { EmptyState } from "./EmptyState";
import { friendlyError } from "../utils/errorMessages";
import { formatSize, timeAgo } from "../utils/format";

interface Props {
  downloads: Download[];
  onUpdate: () => void;
}

const statusIcon: Record<string, string> = {
  pending: "⏳",
  downloading: "⬇",
  completed: "✓",
  failed: "✗",
  cancelled: "⊘",
};

const statusColor: Record<string, string> = {
  pending: "text-gray-400",
  downloading: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
  cancelled: "text-gray-500",
};

export function DownloadList({ downloads, onUpdate }: Props) {
  if (downloads.length === 0) return <EmptyState />;

  const hasCompleted = downloads.some((dl) => dl.status === "completed");

  const handleDelete = async (id: number) => {
    await api.deleteDownload(id);
    onUpdate();
  };

  const handleRetry = async (id: number) => {
    await api.retryDownload(id);
    onUpdate();
  };

  const handleClearCompleted = async () => {
    await api.clearCompleted();
    onUpdate();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium text-gray-400">다운로드 목록</h2>
        <div className="flex gap-3">
          {hasCompleted && (
            <button
              onClick={handleClearCompleted}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              완료 항목 정리
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={() => api.openFolder()}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              폴더 열기
            </button>
          )}
        </div>
      </div>

      {/* Download items */}
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2
                     animate-fade-in-up"
        >
          <div className="flex gap-3">
            {/* Thumbnail */}
            {dl.thumbnail_url && (
              <img
                src={dl.thumbnail_url}
                alt=""
                className="w-16 h-12 rounded object-cover flex-shrink-0"
              />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{dl.title}</p>
                  <p className="text-xs text-gray-500">{dl.channel}</p>
                </div>

                {/* Status + actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs ${statusColor[dl.status] || "text-gray-400"}`}>
                    {statusIcon[dl.status] || ""}{" "}
                    {dl.status === "completed" && dl.file_size
                      ? formatSize(dl.file_size)
                      : ""}
                    {dl.status === "completed" && dl.completed_at
                      ? ` · ${timeAgo(dl.completed_at)}`
                      : ""}
                  </span>

                  {/* Retry button */}
                  {(dl.status === "failed" || dl.status === "cancelled") && (
                    <button
                      onClick={() => handleRetry(dl.id)}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title="재시도"
                    >
                      ⟳
                    </button>
                  )}

                  {/* Delete button */}
                  {dl.status !== "downloading" && (
                    <button
                      onClick={() => handleDelete(dl.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="삭제"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {(dl.status === "downloading" || dl.status === "pending") && (
            <ProgressBar
              progress={dl.progress}
              status={dl.status}
              speed={dl.speed}
              eta={dl.eta}
            />
          )}

          {/* Error message */}
          {dl.status === "failed" && dl.error_message && (
            <p className="text-xs text-red-400">{friendlyError(dl.error_message)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
