import type { Metadata } from "next";
import { Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Badges" };

const BADGES = [
  {
    id: "first_exact",
    name: "Bullseye",
    description: "Predict your first exact scoreline.",
    icon: "🎯",
  },
  {
    id: "hat_trick",
    name: "Hat-trick",
    description: "Three exact scorelines.",
    icon: "🎩",
  },
  {
    id: "hot_streak",
    name: "On Fire",
    description: "Correct results on 3 match-days in a row.",
    icon: "🔥",
  },
  {
    id: "double_or_nothing",
    name: "High Roller",
    description: "Land a double-down for points.",
    icon: "🎲",
    legacy: true,
  },
  {
    id: "group_guru",
    name: "Group Guru",
    description: "Lead the league (sit at #1) across multiple match-days.",
    icon: "🧠",
  },
  {
    id: "top_of_table",
    name: "Table Topper",
    description: "Sit at #1 on the leaderboard.",
    icon: "👑",
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    description: "Five correct results.",
    icon: "🏹",
  },
  {
    id: "perfect_day",
    name: "Perfect Day",
    description: "Every pick on a match-day correct.",
    icon: "☀️",
  },
] as const;

export default async function BadgesPage() {
  await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Award className="size-7 text-gold" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Badges</h1>
          <p className="text-sm text-muted-foreground">
            Every badge you can earn and how to unlock it.
          </p>
        </div>
      </div>

      {/* Badge list */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Award className="size-4 text-gold" />
          <CardTitle className="text-base">All badges</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/40">
            {BADGES.map((badge) => (
              <li key={badge.id} className="flex items-start gap-4 px-6 py-4">
                <span
                  className="mt-0.5 text-3xl leading-none"
                  aria-hidden
                >
                  {badge.icon}
                </span>
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold leading-snug">
                      {badge.name}
                    </span>
                    {"legacy" in badge && badge.legacy && (
                      <span className="text-xs text-muted-foreground">
                        (legacy)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {badge.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
