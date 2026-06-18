"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Swords, Hourglass, Check, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createChallenge, respondToChallenge } from "@/lib/games/actions";
import type { GameMatch, GameMode, GameType, PlayerInfo } from "@/lib/games/types";

export interface GameDefinitionMeta {
  type: GameType;
  title: string;
  emoji: string;
  blurb: string;
  mode: GameMode;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlayerFace({ player }: { player?: PlayerInfo | null }) {
  const name = player?.displayName ?? "Opponent";
  return (
    <Avatar className="size-8 border border-border/60">
      {player?.avatarUrl && <AvatarImage src={player.avatarUrl} alt={name} />}
      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function GamesHub({
  games,
  matches,
  opponents,
  currentUserId,
}: {
  games: GameDefinitionMeta[];
  matches: GameMatch[];
  opponents: PlayerInfo[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogGame, setDialogGame] = useState<GameDefinitionMeta | null>(null);

  const { incoming, active } = useMemo(() => {
    const incoming = matches.filter(
      (m) => m.status === "pending" && m.player2Id === currentUserId,
    );
    const active = matches.filter(
      (m) =>
        m.status === "active" ||
        (m.status === "pending" && m.player1Id === currentUserId),
    );
    return { incoming, active };
  }, [matches, currentUserId]);

  function challenge(gameType: GameType, opponentId: string) {
    startTransition(async () => {
      const res = await createChallenge({ gameType, opponentId });
      if (!res.ok || !res.id) {
        toast.error(res.error ?? "Could not create challenge.");
        return;
      }
      setDialogGame(null);
      router.push(`/games/${res.id}`);
    });
  }

  function respond(matchId: string, accept: boolean) {
    startTransition(async () => {
      const res = await respondToChallenge(matchId, accept);
      if (!res.ok) {
        toast.error(res.error ?? "Could not respond.");
        return;
      }
      if (accept) router.push(`/games/${matchId}`);
      else toast.success("Challenge declined.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Incoming challenges */}
      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Incoming challenges
          </h2>
          {incoming.map((m) => (
            <Card key={m.id} className="border-gold/40 bg-card/70">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <PlayerFace player={m.player1} />
                  <div className="text-sm">
                    <span className="font-medium">
                      {m.player1?.displayName ?? "Someone"}
                    </span>{" "}
                    challenged you to{" "}
                    <span className="font-medium">{gameTitle(games, m.gameType)}</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => respond(m.id, true)}
                  >
                    <Check className="size-4" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => respond(m.id, false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Your active / waiting matches */}
      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Your matches
          </h2>
          {active.map((m) => {
            const opp =
              m.player1Id === currentUserId ? m.player2 : m.player1;
            const yourTurn = m.status === "active" && m.turn === currentUserId;
            const waiting = m.status === "pending";
            return (
              <Link key={m.id} href={`/games/${m.id}`}>
                <Card className="border-border/60 bg-card/70 transition-colors hover:border-gold/40">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <PlayerFace player={opp} />
                      <div className="text-sm">
                        <div className="font-medium">
                          {gameTitle(games, m.gameType)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {opp?.displayName ?? "opponent"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {waiting ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Hourglass className="size-3.5" /> Waiting
                        </span>
                      ) : yourTurn ? (
                        <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold">
                          Your turn
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Their turn
                        </span>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>
      )}

      {/* Game catalog */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Start a game
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <Card key={g.type} className="border-border/60 bg-card/70">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <span className="text-3xl">{g.emoji}</span>
                <CardTitle className="text-base">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{g.blurb}</p>
                <Dialog
                  open={dialogGame?.type === g.type}
                  onOpenChange={(o) => setDialogGame(o ? g : null)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" className="self-start">
                      <Swords className="size-4" /> Challenge a friend
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {g.emoji} {g.title}
                      </DialogTitle>
                      <DialogDescription>
                        Pick who you want to play against.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                      {opponents.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          No other members to challenge yet.
                        </p>
                      ) : (
                        opponents.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            disabled={isPending}
                            onClick={() => challenge(g.type, o.id)}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            <PlayerFace player={o} />
                            <div className="text-sm">
                              <div className="font-medium">{o.displayName}</div>
                              <div className="text-xs text-muted-foreground">
                                @{o.username}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function gameTitle(games: GameDefinitionMeta[], type: string): string {
  return games.find((g) => g.type === type)?.title ?? type;
}
