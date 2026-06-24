import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamFlag } from "@/components/match/team-flag";
import { KickoffTime } from "@/components/match/kickoff-time";
import { requireProfile } from "@/lib/auth/session";
import {
  getStandingsAndBracket,
  type BracketMatch,
  type BracketTeam,
  type GroupTable,
} from "@/lib/matches/standings";

export const metadata: Metadata = { title: "Standings" };

const STAGE_LABEL: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-finals",
  semi_final: "Semi-finals",
  third_place: "Third place",
  final: "Final",
};
const STAGE_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

function GroupCard({ table }: { table: GroupTable }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Group {table.group}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pl-2 text-left font-medium">Team</th>
              <th className="px-1 text-center font-medium">P</th>
              <th className="px-1 text-center font-medium">W</th>
              <th className="px-1 text-center font-medium">D</th>
              <th className="px-1 text-center font-medium">L</th>
              <th className="px-1 text-center font-medium">GD</th>
              <th className="px-1 pr-2 text-center font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr
                key={r.team}
                className={
                  // Top 2 advance directly; 3rd is a possible best-third qualifier.
                  i < 2
                    ? "border-t border-border/40 bg-success/5"
                    : i === 2
                      ? "border-t border-border/40 bg-info/5"
                      : "border-t border-border/40"
                }
              >
                <td className="py-1.5 pl-2">
                  <span className="flex items-center gap-2">
                    <span className="w-3 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <TeamFlag code={r.code} alt={r.team} size={20} />
                    <span className="truncate">{r.team}</span>
                  </span>
                </td>
                <td className="px-1 text-center tabular-nums text-muted-foreground">{r.played}</td>
                <td className="px-1 text-center tabular-nums">{r.won}</td>
                <td className="px-1 text-center tabular-nums">{r.drawn}</td>
                <td className="px-1 text-center tabular-nums">{r.lost}</td>
                <td className="px-1 text-center tabular-nums">
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="px-1 pr-2 text-center font-numeric text-base font-semibold text-gold">
                  {r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Side({ team }: { team: BracketTeam | null }) {
  if (!team) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <TeamFlag code={null} alt="TBD" size={18} />
        <span className="text-xs">TBD</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <TeamFlag code={team.code} alt={team.team} size={18} />
      <span className={team.predicted ? "italic text-muted-foreground" : ""}>{team.team}</span>
    </span>
  );
}

function BracketTie({ m, userTz }: { m: BracketMatch; userTz: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            #{m.matchNo}
            {m.venue ? ` · ${m.venue}` : ""}
          </span>
          <KickoffTime kickoffUtc={m.kickoffUtc} fallbackTz={userTz} format="d MMM · HH:mm" />
        </div>
        <Side team={m.home} />
        <Side team={m.away} />
      </CardContent>
    </Card>
  );
}

export default async function StandingsPage() {
  const profile = await requireProfile();
  const { groups, bracket } = await getStandingsAndBracket();

  const anyPredicted = bracket.some((m) => m.home?.predicted || m.away?.predicted);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/matches"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Matches
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Standings</h1>
        <p className="text-sm text-muted-foreground">
          Live group tables and the projected knockout bracket.
        </p>
      </div>

      <Tabs defaultValue="groups">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="knockout">Knockout</TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="mt-5">
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="mr-3 inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-success/40" /> advance
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-info/40" /> possible best-third
            </span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((t) => (
              <GroupCard key={t.group} table={t} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="knockout" className="mt-5 flex flex-col gap-6">
          {anyPredicted && (
            <p className="text-xs text-muted-foreground">
              <span className="italic">Italic</span> teams are projected from current group
              standings (top 2 advance, plus the 8 best third-placed teams). Real teams replace
              them once groups finish.
            </p>
          )}
          {STAGE_ORDER.map((stage) => {
            const ms = bracket.filter((m) => m.stage === stage);
            if (!ms.length) return null;
            return (
              <section key={stage}>
                <h2 className="mb-2 font-display text-lg">{STAGE_LABEL[stage] ?? stage}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ms.map((m) => (
                    <BracketTie key={m.matchNo} m={m} userTz={profile.timezone} />
                  ))}
                </div>
              </section>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
