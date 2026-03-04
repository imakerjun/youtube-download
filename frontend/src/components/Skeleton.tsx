export function VideoSkeleton() {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 animate-pulse">
      <div className="flex gap-4">
        <div className="w-40 h-24 rounded-lg bg-gray-800 animate-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-800 rounded w-3/4 animate-shimmer" />
          <div className="h-3 bg-gray-800 rounded w-1/2 animate-shimmer" />
          <div className="h-3 bg-gray-800 rounded w-1/4 animate-shimmer" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-10 bg-gray-800 rounded-lg animate-shimmer" />
        <div className="h-8 bg-gray-800 rounded-lg animate-shimmer" />
        <div className="h-8 bg-gray-800 rounded-lg animate-shimmer" />
      </div>
    </div>
  );
}
