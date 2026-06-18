import { Gamepad2, History, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { GameRecordRow, GameHistoryRow } from "@/lib/games/queries";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The Games-tab statistics: aggregate W/L/D per game + a match history showing
 * who you actually played, the result, and the score. Renders nothing extra
 * when the user has no games yet (caller still mounts it; it shows an empty
 * hint). This replaces the per-profile games card.
 */
export function GamesStats({
  record,
  history,
}: {
  record: GameRecordRow[];
  history: GameHistoryRow[];
}) {
  const hasPlayed = record.length > 0 || history.length > 0;

  if (!hasPlayed) {
    return (
      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Gamepad2 className="size-7 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            No games yet — challenge a friend above to start your record.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Your record */}
      {record.length > 0 && (
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Trophy className="size-4 text-gold" />
            <CardTitle className="text-base">Your record</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {record.map((r) => (
              <div
                key={r.gameType}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{r.emoji}</span>
                  <span className="text-sm font-medium">{r.title}</span>
                </div>
                <div className="flex items-center gap-3 font-numeric text-sm">
                  <span className="text-success">{r.wins}W</span>
                  <span className="text-destructive">{r.losses}L</span>
                  <span className="text-muted-foreground">{r.draws}D</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Match history */}
      {history.length > 0 && (
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <History className="size-4 text-primary" />
            <CardTitle className="text-base">Match history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/40">
            {history.map((h) => {
              const oppName = h.opponent?.displayName ?? "Opponent";
              return (
                <div key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-base">{h.emoji}</span>
                  <Avatar className="size-8 border border-border/60">
                    {h.opponent?.avatarUrl && (
                      <AvatarImage src={h.opponent.avatarUrl} alt={oppName} />
                    )}
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                      {initials(oppName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      vs {oppName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {h.title} · {shortDate(h.finishedAt)}
                    </span>
                  </div>
                  {h.score && (
                    <span className="font-numeric text-sm tabular-nums">
                      {h.score.you}–{h.score.them}
                    </span>
                  )}
                  <span
                    className={cn(
                      "w-14 rounded-full px-2 py-0.5 text-center text-[11px] font-bold uppercase",
                      h.result === "won"
                        ? "bg-success/15 text-success"
                        : h.result === "lost"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {h.result}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
