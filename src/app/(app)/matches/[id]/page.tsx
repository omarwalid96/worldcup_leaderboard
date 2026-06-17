import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";
import { ScorePicker } from "@/components/match/score-picker";
import { KickoffTime } from "@/components/match/kickoff-time";
import { FriendsPicks } from "@/components/match/friends-picks";
import { requireProfile } from "@/lib/auth/session";
import { getMatchForPrediction, getMatchPredictions } from "@/lib/predictions/queries";
import { isPredictable } from "@/lib/time/usday";

export const metadata: Metadata = { title: "Make your pick" };

const STAGE_LABEL: Record<string, string> = {
  group: "Group",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

export default async function PredictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const [data, friendsPicks] = await Promise.all([
    getMatchForPrediction(id, profile.id),
    getMatchPredictions(id),
  ]);
  if (!data) notFound();

  const { match, locked, prediction } = data;
  // Editable only within the 12h pre-kickoff window AND before kickoff.
  const inWindow = isPredictable(match.kickoffUtc);
  const editable = inWindow && !locked;
  const isGraded = match.status === "finished";
  const stageText =
    match.stage === "group"
      ? `Group ${match.groupName ?? ""}`.trim()
      : (STAGE_LABEL[match.stage] ?? match.stage);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Link
        href="/matches"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All matches
      </Link>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">
          {stageText}
        </span>
        <h1 className="text-xl font-bold tracking-tight">
          {match.homeTeam} vs {match.awayTeam}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <KickoffTime
            kickoffUtc={match.kickoffUtc}
            fallbackTz={profile.timezone}
            format="EEE d MMM · HH:mm"
          />
          {match.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {match.venue}
            </span>
          )}
        </div>
      </div>

      <ScorePicker
        matchId={match.id}
        home={{ name: match.homeTeam, code: match.homeCode }}
        away={{ name: match.awayTeam, code: match.awayCode }}
        initialHome={prediction?.homePick ?? null}
        initialAway={prediction?.awayPick ?? null}
        initialDoubleDown={prediction?.isDoubleDown ?? false}
        locked={!editable}
        lockReason={
          !inWindow && !locked
            ? "Predictions open 12 hours before kickoff."
            : undefined
        }
      />

      {editable && (
        <p className="text-center text-xs text-muted-foreground">
          Exact score = 3 pts · correct result = 1 pt. Picks lock at kickoff.
        </p>
      )}

      <FriendsPicks picks={friendsPicks} currentUserId={profile.id} graded={isGraded} />
    </div>
  );
}
