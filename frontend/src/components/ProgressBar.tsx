interface Props {
  progress: number;
  status: string;
}

export function ProgressBar({ progress, status }: Props) {
  const color =
    status === "completed" ? "bg-green-500" :
    status === "failed" ? "bg-red-500" :
    "bg-blue-500";

  return (
    <div className="w-full bg-gray-800 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}
