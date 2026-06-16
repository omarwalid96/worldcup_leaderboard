import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rank-trend arrow. A *lower* rank number is better, so previous > current
 * means the user climbed (up arrow, green).
 */
export function RankTrend({
  rank,
  previousRank,
  className,
}: {
  rank: number | null;
  previousRank: number | null;
  className?: string;
}) {
  if (rank == null || previousRank == null || previousRank === 0) {
    return (
      <span className={cn("inline-flex items-center text-muted-foreground", className)}>
        <Minus className="size-3.5" />
      </span>
    );
  }

  const delta = previousRank - rank; // positive = climbed
  if (delta === 0) {
    return (
      <span className={cn("inline-flex items-center text-muted-foreground", className)}>
        <Minus className="size-3.5" />
      </span>
    );
  }

  const climbed = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        climbed ? "text-success" : "text-destructive",
        className,
      )}
      aria-label={climbed ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      {climbed ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {Math.abs(delta)}
    </span>
  );
}
