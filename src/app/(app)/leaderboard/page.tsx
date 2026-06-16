import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Trophy className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            The animated table arrives in Milestone 6.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
