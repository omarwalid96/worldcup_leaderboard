import type { Metadata } from "next";
import {
  Flame,
  Target,
  Trophy,
  Crosshair,
  Award,
  LineChart,
  History,
  Activity,
  TrendingUp,
  PieChart,
  BarChart2,
} from "lucide-react";
import { ZoomableAvatar } from "@/components/avatar/zoomable-avatar";
import { BusinessCard } from "@/components/profile/business-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankTrend } from "@/components/profile/rank-trend";
import { PointsChart } from "@/components/profile/points-chart";
import { OutcomeChart } from "@/components/profile/outcome-chart";
import { PensChart } from "@/components/profile/pens-chart";
import { RankChart } from "@/components/profile/rank-chart";
import { ParticipationChart } from "@/components/profile/participation-chart";
import { PredictionHistory } from "@/components/profile/prediction-history";
import { requireProfile } from "@/lib/auth/session";
import {
  getProfileStats,
  getUserBadges,
  getPointsHistory,
  getOutcomeBreakdown,
  getPensBreakdown,
  getRankHistory,
  getParticipationHistory,
} from "@/lib/profile/stats";
import { getUserPredictionHistory } from "@/lib/predictions/history";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const [
    stats,
    earnedBadges,
    pointsHistory,
    predictionHistory,
    outcomeBreakdown,
    pensBreakdown,
    rankHistoryData,
    participationHistory,
  ] = await Promise.all([
    getProfileStats(profile.id),
    getUserBadges(profile.id),
    getPointsHistory(profile.id),
    getUserPredictionHistory(profile.id),
    getOutcomeBreakdown(profile.id),
    getPensBreakdown(profile.id),
    getRankHistory(profile.id),
    getParticipationHistory(profile.id),
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ZoomableAvatar
          src={profile.avatarUrl}
          alt={profile.displayName}
          fallback={initials}
          className="size-16 border border-border/60"
          fallbackClassName="bg-primary/15 text-xl font-semibold text-primary"
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      {/* Business card — only if one is set in the DB for this user. */}
      {profile.businessCardUrl && (
        <BusinessCard url={profile.businessCardUrl} name={profile.displayName} />
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
            <span className="text-base leading-none">🥅</span>
            <CardTitle className="text-base">Penalty picks</CardTitle>
          </CardHeader>
          <CardContent>
            <PensChart data={pensBreakdown} />
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
          <CardTitle className="text-base">Participation by day</CardTitle>
        </CardHeader>
        <CardContent>
          <ParticipationChart data={participationHistory} />
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

      {/* Pick history */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <History className="size-4 text-primary" />
          <CardTitle className="text-base">My picks</CardTitle>
        </CardHeader>
        <CardContent>
          <PredictionHistory rows={predictionHistory} fallbackTz={profile.timezone} />
        </CardContent>
      </Card>
    </div>
  );
}
