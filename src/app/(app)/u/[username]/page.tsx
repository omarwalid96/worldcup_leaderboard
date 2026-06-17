import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Flame,
  Target,
  Trophy,
  Crosshair,
  History,
  Activity,
  LineChart,
  TrendingUp,
  PieChart,
  BarChart2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PredictionHistory } from "@/components/profile/prediction-history";
import { PointsChart } from "@/components/profile/points-chart";
import { OutcomeChart } from "@/components/profile/outcome-chart";
import { RankChart } from "@/components/profile/rank-chart";
import { ParticipationChart } from "@/components/profile/participation-chart";
import { getProfileByUsername, getUserPredictionHistory } from "@/lib/predictions/history";
import {
  getProfileStats,
  getPointsHistory,
  getOutcomeBreakdown,
  getRankHistory,
  getParticipationHistory,
} from "@/lib/profile/stats";
import { getSessionProfile } from "@/lib/auth/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const [profile, sessionProfile] = await Promise.all([
    getProfileByUsername(username),
    getSessionProfile(),
  ]);

  if (!profile) notFound();

  const [
    stats,
    history,
    pointsHistory,
    outcomeBreakdown,
    rankHistoryData,
    participationHistory,
  ] = await Promise.all([
    getProfileStats(profile.id),
    getUserPredictionHistory(profile.id),
    getPointsHistory(profile.id),
    getOutcomeBreakdown(profile.id),
    getRankHistory(profile.id),
    getParticipationHistory(profile.id),
  ]);

  const initials = profile.displayName
    .split(/\s+/)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isMe = sessionProfile?.id === profile.id;

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
    {
      label: "Participation",
      value:
        stats.lockedAvailable > 0
          ? `${Math.round(stats.participation * 100)}%`
          : "—",
      icon: Activity,
      tone: "text-primary",
    },
  ] as const;

  // Fallback timezone for KickoffTime SSR — use session user's tz if available.
  const fallbackTz = sessionProfile?.timezone ?? "UTC";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
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
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.displayName}
            {isMe && (
              <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">
                You
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60 bg-card/70">
            <CardContent className="flex flex-col gap-1 p-4">
              <s.icon className={`size-4 ${s.tone}`} />
              <div className="font-numeric text-3xl leading-none">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Points over time */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <LineChart className="size-4 text-primary" />
          <CardTitle className="text-base">Points over time</CardTitle>
        </CardHeader>
        <CardContent>
          <PointsChart data={pointsHistory} />
        </CardContent>
      </Card>

      {/* Charts row: outcome breakdown + rank over time */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <PieChart className="size-4 text-gold" />
            <CardTitle className="text-base">Outcome breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <OutcomeChart data={outcomeBreakdown} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <TrendingUp className="size-4 text-primary" />
            <CardTitle className="text-base">Rank over time</CardTitle>
          </CardHeader>
          <CardContent>
            <RankChart data={rankHistoryData} />
          </CardContent>
        </Card>
      </div>

      {/* Participation chart */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <BarChart2 className="size-4 text-primary" />
          <CardTitle className="text-base">Participation by matchday</CardTitle>
        </CardHeader>
        <CardContent>
          <ParticipationChart data={participationHistory} />
        </CardContent>
      </Card>

      {/* Pick history */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <History className="size-4 text-primary" />
          <CardTitle className="text-base">Pick history</CardTitle>
        </CardHeader>
        <CardContent>
          <PredictionHistory rows={history} fallbackTz={fallbackTz} />
        </CardContent>
      </Card>
    </div>
  );
}
