"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Users, UserPlus, Play, Trophy, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haptic, celebrateExact } from "@/lib/celebrate";
import { TRIVIA_QUESTIONS } from "@/lib/games/trivia/questions";

// Default removed in favor of state
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function TriviaParty() {
  const [players, setPlayers] = useState<string[]>([]);
  const [newPlayer, setNewPlayer] = useState("");
  const [phase, setPhase] = useState<"lobby" | "playing" | "round_results" | "results">("lobby");
  const [questionCount, setQuestionCount] = useState(10);
  
  // Game State
  const [questions, setQuestions] = useState<typeof TRIVIA_QUESTIONS>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  
  // Turn State
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [roundAnswers, setRoundAnswers] = useState<Record<string, number>>({});
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

  function addPlayer() {
    if (!newPlayer.trim() || players.includes(newPlayer.trim())) return;
    setPlayers(p => [...p, newPlayer.trim()]);
    setNewPlayer("");
  }

  function startGame() {
    if (players.length < 1) return;
    setQuestions(shuffle(TRIVIA_QUESTIONS).slice(0, questionCount));
    setScores(players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {}));
    setCurrentQ(0);
    setCurrentPlayerIdx(0);
    setRoundAnswers({});
    setSelectedChoice(null);
    setPhase("playing");
  }

  function answer(choice: number) {
    if (selectedChoice !== null) return;
    haptic();
    setSelectedChoice(choice);

    const activePlayer = players[currentPlayerIdx];
    const newRoundAnswers = { ...roundAnswers, [activePlayer]: choice };
    setRoundAnswers(newRoundAnswers);

    setTimeout(() => {
      // Next turn or evaluate round
      if (currentPlayerIdx < players.length - 1) {
        setCurrentPlayerIdx(i => i + 1);
        setSelectedChoice(null);
      } else {
        // Everyone answered this question, evaluate!
        const question = questions[currentQ];
        let correctCount = 0;
        setScores(s => {
          const nextScores = { ...s };
          for (const p of players) {
             if (newRoundAnswers[p] === question.answerIndex) {
                nextScores[p]++;
                correctCount++;
             }
          }
          return nextScores;
        });
        if (correctCount > 0) {
          haptic([30, 50, 30]);
        }
        setPhase("round_results");
        setSelectedChoice(null);
      }
    }, 500); // brief delay to show they tapped it
  }

  function nextRound() {
    if (currentQ < questionCount - 1) {
      setCurrentQ(q => q + 1);
      setCurrentPlayerIdx(0);
      setRoundAnswers({});
      setPhase("playing");
    } else {
      celebrateExact();
      setPhase("results");
    }
  }

  if (phase === "lobby") {
    return (
      <div className="flex flex-col gap-6">
        <Card className="border-gold/40 bg-card/70 text-center">
          <CardContent className="pt-6">
             <div className="mx-auto w-fit rounded-full bg-primary/10 p-4 mb-4">
               <Users className="size-8 text-gold" />
             </div>
             <h2 className="font-display text-2xl tracking-tight mb-2">Local Party Mode</h2>
             <p className="text-sm text-muted-foreground">
               Pass the phone around. Who knows World Cup history best?
             </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Players</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {players.length === 0 && (
              <span className="text-xs text-muted-foreground italic">Add players below...</span>
            )}
            {players.map(p => (
              <span key={p} className="bg-muted px-3 py-1.5 rounded-full text-sm flex items-center gap-2">
                {p}
                <button onClick={() => setPlayers(pts => pts.filter(x => x !== p))} className="text-muted-foreground hover:text-destructive">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={e => { e.preventDefault(); addPlayer(); }} className="flex gap-2">
            <Input 
              placeholder="Player name..." 
              value={newPlayer}
              onChange={e => setNewPlayer(e.target.value)}
              className="bg-card"
            />
            <Button type="submit" variant="secondary" disabled={!newPlayer.trim()}>
              <UserPlus className="size-4" />
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Number of Questions</h3>
          <div className="flex gap-2">
             {[5, 10, 15, 20].map(n => (
               <Button
                 key={n}
                 variant={questionCount === n ? "default" : "outline"}
                 onClick={() => setQuestionCount(n)}
                 className="flex-1"
               >
                 {n}
               </Button>
             ))}
          </div>
        </div>

        <Button size="lg" disabled={players.length === 0} onClick={startGame} className="mt-4">
          <Play className="size-4 mr-2" /> Start Party Game
        </Button>
      </div>
    );
  }

  if (phase === "round_results") {
    const question = questions[currentQ];
    
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
           <span className="text-xs font-medium text-muted-foreground">
             Round {currentQ + 1} Results
           </span>
        </div>
        
        {/* Scores */}
        <div className="flex flex-wrap gap-3 justify-center">
          {players.map(p => (
            <div key={p} className="flex flex-col items-center p-2 bg-card rounded-lg border border-border/40 min-w-[4rem]">
               <span className="text-xs font-medium text-muted-foreground truncate w-full text-center">{p}</span>
               <span className="font-numeric text-2xl">{scores[p]}</span>
            </div>
          ))}
        </div>

        <Card className="border-border/60 bg-card/70">
          <CardContent className="p-6">
            <h2 className="text-lg font-medium leading-snug mb-6">{question.q}</h2>
            <div className="flex flex-col gap-3">
              {question.choices.map((choice, idx) => {
                const isCorrect = idx === question.answerIndex;
                const playersWhoPicked = players.filter(p => roundAnswers[p] === idx);
                
                return (
                  <div key={idx} className={cn("p-4 rounded-md border", isCorrect ? "bg-success/20 border-success" : "border-border/40 bg-card")}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={cn("font-medium", isCorrect ? "text-success" : "")}>{choice}</span>
                      {isCorrect && <Check className="size-4 text-success" />}
                    </div>
                    {playersWhoPicked.length > 0 && (
                       <div className="flex flex-wrap gap-1 mt-2">
                         {playersWhoPicked.map(p => (
                            <span key={p} className={cn("text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1", isCorrect ? "bg-success/20 text-success-foreground" : "bg-destructive/20 text-destructive-foreground")}>
                               {p} {isCorrect ? <Check className="size-3" /> : <X className="size-3" />}
                            </span>
                         ))}
                       </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Button size="lg" onClick={nextRound} className="mt-4">
          {currentQ < questionCount - 1 ? "Next Question" : "View Final Results"}
        </Button>
      </div>
    );
  }

  if (phase === "results") {
    const sorted = [...players].sort((a, b) => scores[b] - scores[a]);
    const maxScore = scores[sorted[0]];

    return (
       <div className="flex flex-col gap-6 items-center text-center">
          <Trophy className="size-16 text-gold mt-6" />
          <h2 className="font-display text-3xl">Party Over!</h2>
          
          <Card className="w-full border-border/60 bg-card/70 mt-4">
             <CardContent className="p-0 flex flex-col">
               {sorted.map((p, i) => (
                  <div key={p} className={cn("flex items-center justify-between p-4 border-b border-border/40 last:border-0", scores[p] === maxScore && "bg-gold/10")}>
                     <div className="flex items-center gap-3">
                        <span className="font-numeric text-xl w-6 text-muted-foreground">{i + 1}</span>
                        <span className="font-medium">{p}</span>
                        {scores[p] === maxScore && <Trophy className="size-4 text-gold ml-1" />}
                     </div>
                     <span className="font-numeric text-2xl">{scores[p]} <span className="text-sm text-muted-foreground font-sans">pts</span></span>
                  </div>
               ))}
             </CardContent>
          </Card>

          <Button size="lg" onClick={startGame} className="w-full max-w-xs mt-6">
            <RotateCcw className="size-4 mr-2" /> Play Again
          </Button>
          <Button variant="outline" onClick={() => setPhase("lobby")} className="w-full max-w-xs">
             Change Players
          </Button>
       </div>
    );
  }

  // Playing Phase
  const question = questions[currentQ];
  const activePlayer = players[currentPlayerIdx];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Round {currentQ + 1} of {questionCount}
        </span>
        <span className="text-xs font-medium bg-gold/20 text-gold px-2 py-0.5 rounded">
          {activePlayer}'s Turn
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${(currentQ / questionCount) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activePlayer + currentQ}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex flex-col gap-6"
        >
          <Card className="border-border/60 bg-card/70">
            <CardContent className="p-6">
              <h2 className="text-lg font-medium leading-snug mb-6">
                <span className="text-gold block text-sm font-semibold mb-2">For {activePlayer}:</span>
                {question.q}
              </h2>
              <div className="flex flex-col gap-3">
                {question.choices.map((choice, idx) => {
                  const isSelected = selectedChoice === idx;
                  let variant: "default" | "outline" | "secondary" = "outline";
                  
                  if (isSelected) {
                    variant = "default";
                  }

                  return (
                    <Button
                      key={idx}
                      variant={variant}
                      disabled={selectedChoice !== null}
                      onClick={() => answer(idx)}
                      className="h-auto py-4 px-4 justify-start text-left whitespace-normal"
                    >
                      <span className="flex-1">{choice}</span>
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="mt-auto flex justify-center gap-2 pb-4">
        {players.map((p, i) => (
          <div key={p} className={cn("size-2 rounded-full transition-colors", i === currentPlayerIdx ? "bg-gold" : "bg-border")} />
        ))}
      </div>
    </div>
  );
}
