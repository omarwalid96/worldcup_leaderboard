import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching MatchCard's layout. */
export function MatchCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex flex-col gap-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-7 rounded-sm" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-6 w-5" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

export function MatchGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}
