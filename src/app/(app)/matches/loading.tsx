import { Skeleton } from "@/components/ui/skeleton";
import { MatchGridSkeleton } from "@/components/match/match-card-skeleton";

export default function MatchesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <MatchGridSkeleton count={4} />
      </div>
    </div>
  );
}
