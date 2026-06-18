"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Radio, Trophy, Check, X, Clock } from "lucide-react";
import { motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { haptic, celebrateExact } from "@/lib/celebrate";
import { useGameRoom } from "@/components/games/use-game-room";
import { applyMove } from "@/lib/games/actions";
import type { GameComponentProps, PlayerInfo } from "@/lib/games/types";
import { type TriviaState, QUESTIONS_PER_MATCH } from "@/lib/games/trivia/reducer";
import { TRIVIA_QUESTIONS } from "@/lib/games/trivia/questions";

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function PlayerTag({
  player,
  score,
  you,
}: {
  player?: PlayerInfo | null;
  score: number;
  you: boolean;
}) {
  const name = player?.displayName ?? "Opponent";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl px-3 py-2">
      <Avatar className="size-12 border border-border/60">
        {player?.avatarUrl && <AvatarImage src={player.avatarUrl} alt={name} />}
        <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[6rem] truncate text-xs font-medium">
        {name}
        {you && <span className="ml-1 text-gold">(you)</span>}
      </span>
      <span className="font-numeric text-2xl leading-none">{score}</span>
    </div>
  );
}

export function TriviaDuel({
  matchId,
  initialMatch,
  currentUserId,
}: GameComponentProps) {
  const { match, connected, present, broadcast, setMatch } =
    useGameRoom(matchId, initialMatch, currentUserId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const state = match.state as TriviaState;
  const isP1 = match.player1Id === currentUserId;
  const mySlot = isP1 ? "p1" : "p2";
  const oppSlot = isP1 ? "p2" : "p1";
  
  const me = isP1 ? match.player1 : match.player2;
  const opp = isP1 ? match.player2 : match.player1;

  const finished = match.status === "finished";
  const myAnswers = state.answers[mySlot] || [];
  const oppAnswers = state.answers[oppSlot] || [];

  // Local state for the current question
  const currentQuestionIndex = myAnswers.length;
  const currentQid = state.questionIds[currentQuestionIndex];
  const question = TRIVIA_QUESTIONS.find(q => q.id === currentQid);
  
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  
  // Confetti when I win.
  useEffect(() => {
    if (finished && match.winnerId === currentUserId) {
      celebrateExact();
    }
  }, [finished, match.winnerId, currentUserId]);

  // Reset timer on new question
  useEffect(() => {
    setStartTime(Date.now());
    setSelectedChoice(null);
  }, [currentQuestionIndex]);

  // Tell opponent we're here and answering
  useEffect(() => {
    broadcast("sync", { at: Date.now() });
  }, [myAnswers.length, broadcast]);

  function answer(choice: number) {
    if (isPending || selectedChoice !== null || !question) return;
    haptic();
    setSelectedChoice(choice);
    
    const ms = Date.now() - startTime;
    const isCorrect = choice === question.answerIndex;
    
    if (isCorrect) haptic([30, 50, 30]);

    startTransition(async () => {
      const res = await applyMove(matchId, { kind: "answer", qid: question.id, choice, ms });
      if (!res.ok) {
        setError(res.error ?? "Failed to submit answer.");
        setSelectedChoice(null);
        return;
      }
      if (res.match) setMatch(res.match);
      broadcast("sync", { at: Date.now() });
    });
  }

  // Waiting for opponent to finish
  if (myAnswers.length === QUESTIONS_PER_MATCH && !finished) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-gold" />
        <h2 className="text-xl font-semibold">Waiting for {opp?.displayName || "opponent"}</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;ve answered all questions. Waiting for them to finish so we can tally the score!
        </p>
        <div className="mt-4 flex w-full max-w-xs items-center justify-between text-xs">
          <span>You: {myAnswers.length}/{QUESTIONS_PER_MATCH}</span>
          <span>Them: {oppAnswers.length}/{QUESTIONS_PER_MATCH}</span>
        </div>
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${(oppAnswers.length / QUESTIONS_PER_MATCH) * 100}%` }} />
        </div>
        {opp?.id && !present.includes(opp.id) && (
          <span className="mt-4 text-xs text-muted-foreground/60">
            They are currently offline. You can leave; the result will update when they play.
          </span>
        )}
      </div>
    );
  }

  if (finished) {
    const iWon = match.winnerId === currentUserId;
    const draw = match.winnerId === null;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-3 w-full"
        >
          {iWon ? (
            <Trophy className="size-12 text-gold" />
          ) : draw ? (
            <span className="text-4xl">🤝</span>
          ) : (
            <span className="text-4xl">🫠</span>
          )}
          <h2 className="font-display text-2xl">
            {iWon ? "You won!" : draw ? "It's a draw!" : "You lost"}
          </h2>
          <div className="flex items-center justify-center gap-4 my-4">
             <PlayerTag player={me} score={isP1 ? state.scoreP1 : state.scoreP2} you />
             <span className="font-display text-xl text-muted-foreground">vs</span>
             <PlayerTag player={opp} score={isP1 ? state.scoreP2 : state.scoreP1} you={false} />
          </div>

          <div className="w-full text-left space-y-2 mt-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Match Recap</h3>
            {state.questionIds.map((qid, idx) => {
               const myA = state.answers[mySlot].find(a => a.qid === qid);
               const oppA = state.answers[oppSlot].find(a => a.qid === qid);
               return (
                 <div key={qid} className="text-xs flex items-center justify-between border-b border-border/40 pb-2">
                    <span className="w-8 text-muted-foreground">Q{idx+1}</span>
                    <span className={cn("flex-1", myA?.correct ? "text-success" : "text-destructive")}>
                       {myA?.correct ? <Check className="inline size-3 mr-1"/> : <X className="inline size-3 mr-1"/>}
                       You {myA?.correct && oppA?.correct && myA.ms < oppA.ms ? "(Faster)" : ""}
                    </span>
                    <span className={cn("flex-1 text-right", oppA?.correct ? "text-success" : "text-destructive")}>
                       {oppA?.correct && myA?.correct && oppA.ms < myA.ms ? "(Faster)" : ""} They
                       {oppA?.correct ? <Check className="inline size-3 ml-1"/> : <X className="inline size-3 ml-1"/>}
                    </span>
                 </div>
               )
            })}
          </div>

          <Button variant="outline" onClick={() => history.back()} className="mt-6">
            Back to games
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Question {currentQuestionIndex + 1} of {QUESTIONS_PER_MATCH}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium",
            connected ? "text-success" : "text-muted-foreground/50",
          )}
        >
          <Radio className={cn("size-3", connected && "text-success")} />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${(currentQuestionIndex / QUESTIONS_PER_MATCH) * 100}%` }} />
      </div>

      {question ? (
        <Card className="border-border/60 bg-card/70 mt-4">
          <CardContent className="p-6">
            <h2 className="text-lg font-medium leading-snug mb-6">{question.q}</h2>
            <div className="flex flex-col gap-3">
              {question.choices.map((choice, idx) => {
                 const isSelected = selectedChoice === idx;
                 let variant: "default" | "outline" | "secondary" = "outline";
                 let bg = "";
                 
                 // If selected, we don't show right/wrong immediately to not spoil it if the other player is in the room. 
                 // We just show a selected state until it submits.
                 if (isSelected) {
                   variant = "default";
                 } else if (selectedChoice !== null) {
                   bg = "opacity-50";
                 }

                 return (
                   <Button
                     key={idx}
                     variant={variant}
                     size="lg"
                     disabled={selectedChoice !== null || isPending}
                     onClick={() => answer(idx)}
                     className={cn("h-auto py-4 px-4 justify-start text-left whitespace-normal", bg)}
                   >
                     {choice}
                   </Button>
                 )
              })}
            </div>
            {error && <p className="mt-4 text-xs text-destructive text-center">{error}</p>}
          </CardContent>
        </Card>
      ) : (
        <Loader2 className="size-8 animate-spin mx-auto text-muted-foreground" />
      )}

      <div className="mt-auto pt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40">
         <span>Their progress: {oppAnswers.length}/{QUESTIONS_PER_MATCH}</span>
         <span className="flex items-center gap-1">
            <Clock className="size-3" />
            Fastest correct wins points!
         </span>
      </div>
    </div>
  );
}
