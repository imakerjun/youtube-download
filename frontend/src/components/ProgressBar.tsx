import { formatSpeed, formatEta } from "../utils/format";

interface Props {
  progress: number;
  status: string;
  speed?: number;
  eta?: number;
}

export function ProgressBar({ progress, status, speed = 0, eta = 0 }: Props) {
  const color =
    status === "completed" ? "bg-green-500" :
    status === "failed" ? "bg-red-500" :
    "bg-blue-500";

  const pct = Math.min(progress, 100);

  return (
    <div className="space-y-1">
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{pct.toFixed(0)}%</span>
        <span>
          {speed > 0 && formatSpeed(speed)}
          {speed > 0 && eta > 0 && " · "}
          {eta > 0 && `남은 시간 ${formatEta(eta)}`}
        </span>
      </div>
    </div>
  );
}
