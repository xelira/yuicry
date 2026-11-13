export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface2 ${className}`} />;
}

export function TrackSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <Skeleton className="h-10 w-10 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="h-3.5 w-2/3" />
      <Skeleton className="h-2.5 w-1/3" />
    </div>
  );
}
