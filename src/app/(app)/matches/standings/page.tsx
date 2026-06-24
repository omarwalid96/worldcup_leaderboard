import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamFlag } from "@/components/match/team-flag";
import { KickoffTime } from "@/components/match/kickoff-time";
import { BracketZoom } from "@/components/match/bracket-zoom";
import { requireProfile } from "@/lib/auth/session";
import {
  getStandingsAndBracket,
  BRACKET_COLUMNS,
  type BracketMatch,
  type BracketTeam,
  type GroupTable,
} from "@/lib/matches/standings";

export const metadata: Metadata = { title: "Standings" };


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

function BracketNode({ m, userTz }: { m: BracketMatch; userTz: string }) {
  const predicted = !m.real && (!!m.home?.predicted || !!m.away?.predicted);
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <KickoffTime kickoffUtc={m.kickoffUtc} fallbackTz={userTz} format="d MMM · HH:mm" />
          {predicted ? (
            <span className="rounded-sm bg-info/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-info">
              Predicted
            </span>
          ) : (
            <span className="text-[10px]">#{m.matchNo}</span>
          )}
        </div>
        <Side team={m.home} />
        <Side team={m.away} />
      </CardContent>
    </Card>
  );
}

const COLUMN_LABELS = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];
const CONNECTOR = "border-gold/45";

/**
 * One round's column. Nodes are wrapped in feeder pairs; each pair draws a CSS
 * elbow (vertical line joining the two nodes + a horizontal stub to the right)
 * that lands exactly on the next round's node center — both are centered by
 * `justify-around`, so the geometry holds at any height. The Final (last col)
 * draws no outgoing elbow; rounds after R32 draw an incoming stub on the left.
 */
function BracketColumn({
  nos,
  col,
  byNo,
  userTz,
}: {
  nos: number[];
  col: number;
  byNo: Map<number, BracketMatch>;
  userTz: string;
}) {
  const isLast = col === BRACKET_COLUMNS.length - 1;
  const hasIncoming = col > 0;
  // Pair consecutive matches (feeders of the same next-round match).
  const pairs: number[][] = [];
  for (let i = 0; i < nos.length; i += 2) pairs.push(nos.slice(i, i + 2));

  return (
    <div className="flex flex-1 flex-col">
      <h3 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {COLUMN_LABELS[col]}
      </h3>
      <div className="flex flex-1 flex-col justify-around gap-2">
        {pairs.map((pair, pi) => (
          <div key={pi} className="relative flex flex-col justify-around gap-2">
            {pair.map((no) => {
              const m = byNo.get(no);
              if (!m) return null;
              return (
                <div key={no} className="relative">
                  {/* incoming stub: from the left column's elbow into this node */}
                  {hasIncoming && (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute right-full top-1/2 h-0.5 w-3 -translate-y-1/2 ${CONNECTOR.replace("border", "bg")}`}
                    />
                  )}
                  <BracketNode m={m} userTz={userTz} />
                </div>
              );
            })}
            {/* Outgoing elbow ("]"): two arms reaching each node center (top 25% /
                bottom 25% of the pair) joined by a vertical line, then a stub to
                the next column. Sits in the 12px column gap (left-full, w-3). The
                pair's vertical center == the next round's node center (both laid
                out by justify-around), so the stub lands on it. */}
            {!isLast && pair.length === 2 && (
              <span
                aria-hidden
                className={`pointer-events-none absolute left-full top-[25%] bottom-[25%] w-3 border-y-2 border-r-2 ${CONNECTOR}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function StandingsPage() {
  const profile = await requireProfile();
  const { groups, bracket } = await getStandingsAndBracket();

  const byNo = new Map(bracket.map((m) => [m.matchNo, m]));
  const thirdPlace = bracket.find((m) => m.stage === "third_place") ?? null;
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

        <TabsContent value="knockout" className="mt-5 flex flex-col gap-5">
          {anyPredicted && (
            <p className="text-xs text-muted-foreground">
              Ties marked <span className="font-semibold text-info">Predicted</span> are projected
              from current group standings (top 2 advance, plus the 8 best third-placed teams). They
              fill in for real once each round is decided.
            </p>
          )}

          {/* Connected bracket: one flex column per round, evenly spaced so each
              tie sits between its two feeders. Zoom + pan via BracketZoom. */}
          <BracketZoom>
            <div className="flex w-[920px] gap-3">
              {BRACKET_COLUMNS.map((nos, col) => (
                <BracketColumn
                  key={col}
                  nos={nos}
                  col={col}
                  byNo={byNo}
                  userTz={profile.timezone}
                />
              ))}
            </div>
          </BracketZoom>

          {thirdPlace && (
            <div className="max-w-xs">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Third place
              </h3>
              <BracketNode m={thirdPlace} userTz={profile.timezone} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
