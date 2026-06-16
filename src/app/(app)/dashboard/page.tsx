import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Trophy, Target, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
      </div>

      {/* Quick actions — these light up as later milestones land */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Target className="size-5" />
            </span>
            <CardTitle className="text-base">Make your picks</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Predict upcoming scorelines before kickoff.
            </p>
            <Button asChild size="sm" variant="secondary" className="group shrink-0">
              <Link href="/matches">
                Open <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
              <Trophy className="size-5" />
            </span>
            <CardTitle className="text-base">The table</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              See where you stand in the league.
            </p>
            <Button asChild size="sm" variant="secondary" className="group shrink-0">
              <Link href="/leaderboard">
                View <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for the upcoming-matches strip (Milestone 3) */}
      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CalendarDays className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Fixtures load here once the schedule is seeded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
