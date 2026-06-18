import { Gamepad2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameRecordRow } from "@/lib/games/queries";

/**
 * Profile "Games record" card — W/L/D per game. Render only when the user has
 * played at least one game (the parent checks `record.length > 0`).
 */
export function GamesRecordCard({ record }: { record: GameRecordRow[] }) {
  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Gamepad2 className="size-4 text-gold" />
        <CardTitle className="text-base">Games record</CardTitle>
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
  );
}
