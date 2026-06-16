import type { Metadata } from "next";
import { Flame, Target, Trophy, Crosshair, Award, LineChart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankTrend } from "@/components/profile/rank-trend";
import { requireProfile } from "@/lib/auth/session";
import { getProfileStats, getUserBadges } from "@/lib/profile/stats";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const [stats, earnedBadges] = await Promise.all([
    getProfileStats(profile.id),
    getUserBadges(profile.id),
  ]);

  const initials = profile.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const statCards = [
    {
      label: "Total points",
      value: stats.totalPoints.toString(),
      icon: Trophy,
      tone: "text-gold",
    },
    {
      label: "Rank",
      value: stats.rank ? `#${stats.rank}` : "—",
      icon: Target,
      tone: "text-primary",
      trend: <RankTrend rank={stats.rank} previousRank={stats.previousRank} />,
    },
    {
      label: "Streak",
      value: stats.streak.toString(),
      icon: Flame,
      tone: "text-destructive",
    },
    {
      label: "Accuracy",
      value:
        stats.gradedCount > 0 ? `${Math.round(stats.accuracy * 100)}%` : "—",
      icon: Crosshair,
      tone: "text-foreground",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar className="size-16 border border-border/60">
          {profile.avatarUrl && (
            <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
          )}
          <AvatarFallback className="bg-primary/15 text-xl font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60 bg-card/70">
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between">
                <s.icon className={`size-4 ${s.tone}`} />
                {"trend" in s ? s.trend : null}
              </div>
              <div className="font-numeric text-3xl leading-none">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Points over time — chart lands in Milestone 7 */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <LineChart className="size-4 text-primary" />
          <CardTitle className="text-base">Points over time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
            Your progress chart appears once matches are graded.
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Award className="size-4 text-gold" />
          <CardTitle className="text-base">Badges</CardTitle>
        </CardHeader>
        <CardContent>
          {earnedBadges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No badges yet. Nail an exact score to earn your first one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {earnedBadges.map((b) => (
                <Badge key={b.id} variant="secondary" className="gap-1.5 py-1.5">
                  <span aria-hidden>{b.icon}</span>
                  {b.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
