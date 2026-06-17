"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Zap, Loader2, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { TeamFlag } from "./team-flag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { savePrediction } from "@/lib/predictions/actions";
import { celebrateSave, haptic } from "@/lib/celebrate";
import { motion, AnimatePresence } from "motion/react";

interface Team {
  name: string;
  code: string | null;
}

function Stepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= 20}
        onClick={() => {
          haptic(30);
          onChange(value + 1);
        }}
        className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
      <span className="font-numeric w-12 text-center text-5xl" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= 0}
        onClick={() => {
          haptic(30);
          onChange(Math.max(0, value - 1));
        }}
        className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
    </div>
  );
}

export function ScorePicker({
  matchId,
  home,
  away,
  initialHome,
  initialAway,
  initialDoubleDown,
  locked,
  lockReason,
  isKnockout = false,
  initialPensWinner = null,
  initialPensHome = null,
  initialPensAway = null,
}: {
  matchId: string;
  home: Team;
  away: Team;
  initialHome: number | null;
  initialAway: number | null;
  initialDoubleDown: boolean;
  locked: boolean;
  /** Optional override message for the locked banner. */
  lockReason?: string;
  /** Knockout match → show the optional penalty-shootout prediction. */
  isKnockout?: boolean;
  initialPensWinner?: "home" | "away" | null;
  initialPensHome?: number | null;
  initialPensAway?: number | null;
}) {
  const router = useRouter();
  const [homePick, setHomePick] = useState(initialHome ?? 0);
  const [awayPick, setAwayPick] = useState(initialAway ?? 0);
  const [doubleDown, setDoubleDown] = useState(initialDoubleDown);
  const [pensWinner, setPensWinner] = useState<"home" | "away" | null>(initialPensWinner);
  const [pensHome, setPensHome] = useState(initialPensHome ?? 5);
  const [pensAway, setPensAway] = useState(initialPensAway ?? 4);
  const [showPensScore, setShowPensScore] = useState(
    initialPensHome != null && initialPensAway != null,
  );
  const [pending, startTransition] = useTransition();
  const [floatingLogos, setFloatingLogos] = useState<{ id: number; delay: number; xOffset: number; scale: number }[]>([]);

  const hadPrediction = initialHome != null;
  const dirty =
    homePick !== (initialHome ?? 0) ||
    awayPick !== (initialAway ?? 0) ||
    doubleDown !== initialDoubleDown ||
    pensWinner !== initialPensWinner ||
    (showPensScore && (pensHome !== initialPensHome || pensAway !== initialPensAway));

  function onSave() {
    startTransition(async () => {
      const res = await savePrediction({
        matchId,
        homePick,
        awayPick,
        isDoubleDown: doubleDown,
        pensWinner: isKnockout ? pensWinner : null,
        pensHomePick: isKnockout && pensWinner && showPensScore ? pensHome : null,
        pensAwayPick: isKnockout && pensWinner && showPensScore ? pensAway : null,
      });
      if (res.ok) {
        celebrateSave();
        
        // Spawn floating wiggling logos
        const now = Date.now();
        setFloatingLogos([
          { id: now, delay: 0, xOffset: -45, scale: 0.95 },
          { id: now + 1, delay: 0.12, xOffset: 0, scale: 1.25 },
          { id: now + 2, delay: 0.24, xOffset: 45, scale: 0.9 },
        ]);

        toast.success("Pick saved", {
          description: `${home.name} ${homePick}–${awayPick} ${away.name}${doubleDown ? " · double-down" : ""}`,
        });
        
        // Clear floating logos after animation completes
        setTimeout(() => {
          setFloatingLogos([]);
        }, 2200);

        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't save your pick.");
        if (res.error?.includes("locked")) router.refresh();
      }
    });
  }

  return (
    <div className="relative flex flex-col gap-6">
      {/* Floating Logos Animation */}
      <AnimatePresence>
        {floatingLogos.map((logo) => (
          <motion.div
            key={logo.id}
            initial={{
              opacity: 0,
              scale: 0.3 * logo.scale,
              y: 20,
              x: `calc(-50% + ${logo.xOffset}px)`,
              rotate: 0,
            }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [
                0.3 * logo.scale,
                1.1 * logo.scale,
                1 * logo.scale,
                0.7 * logo.scale,
              ],
              y: -240,
              x: [
                `calc(-50% + ${logo.xOffset}px)`,
                `calc(-50% + ${logo.xOffset - 20}px)`,
                `calc(-50% + ${logo.xOffset + 20}px)`,
                `calc(-50% + ${logo.xOffset - 12}px)`,
                `calc(-50% + ${logo.xOffset + 12}px)`,
                `calc(-50% + ${logo.xOffset}px)`,
              ],
              rotate: [0, -25, 25, -15, 15, 0],
            }}
            transition={{
              duration: 1.8,
              delay: logo.delay,
              ease: "easeOut",
            }}
            className="absolute pointer-events-none z-50 left-1/2 bottom-16"
          >
            <div className="relative size-14 overflow-hidden rounded-full border-2 border-gold/75 bg-background shadow-lg shadow-gold/30">
              <img
                src="/brand-mark.jpg"
                alt="Eznii Ya Dawly Logo"
                className="size-full object-cover"
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {/* Score steppers */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border bg-card/70 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <TeamFlag code={home.code} alt={home.name} size={48} />
          <span className="text-sm font-semibold">{home.name}</span>
          <Stepper value={homePick} onChange={setHomePick} disabled={locked || pending} label={`${home.name} goals`} />
        </div>

        <span className="pb-8 text-2xl font-bold text-muted-foreground">–</span>

        <div className="flex flex-col items-center gap-3 text-center">
          <TeamFlag code={away.code} alt={away.name} size={48} />
          <span className="text-sm font-semibold">{away.name}</span>
          <Stepper value={awayPick} onChange={setAwayPick} disabled={locked || pending} label={`${away.name} goals`} />
        </div>
      </div>

      {locked ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-center text-sm font-medium text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          {lockReason ?? "This match has kicked off — picks are locked."}
        </div>
      ) : (
        <>
          {/* Double-down toggle */}
          <button
            type="button"
            onClick={() => {
              haptic(20);
              setDoubleDown((d) => !d);
            }}
            disabled={pending}
            className={cn(
              "flex items-center justify-between rounded-xl border p-4 text-left transition-colors",
              doubleDown
                ? "border-gold/50 bg-gold/10"
                : "border-border/60 bg-card/50 hover:border-gold/30",
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  doubleDown ? "bg-gold/20 text-gold" : "bg-secondary text-muted-foreground",
                )}
              >
                <Zap className="size-4.5" />
              </span>
              <div>
                <div className="text-sm font-semibold">Double down</div>
                <div className="text-xs text-muted-foreground">
                  Double the points for this match. One per matchday.
                </div>
              </div>
            </div>
            <span
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                doubleDown ? "bg-gold" : "bg-secondary",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-background transition-transform",
                  doubleDown ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </span>
          </button>

          {/* Penalty shootout (knockout only) — optional bonus prediction */}
          {isKnockout && (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
              <div>
                <div className="text-sm font-semibold">If it goes to penalties…</div>
                <div className="text-xs text-muted-foreground">
                  Optional. +1 correct winner, +1 exact shootout score.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["home", "away"] as const).map((side) => {
                  const team = side === "home" ? home : away;
                  const active = pensWinner === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        haptic(15);
                        setPensWinner(active ? null : side);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors",
                        active
                          ? "border-gold/50 bg-gold/10 font-semibold"
                          : "border-border/60 hover:border-gold/30",
                      )}
                    >
                      <TeamFlag code={team.code} alt={team.name} size={22} />
                      <span className="truncate">{team.name}</span>
                    </button>
                  );
                })}
              </div>

              {pensWinner && (
                <button
                  type="button"
                  onClick={() => setShowPensScore((s) => !s)}
                  className="self-start text-xs font-medium text-gold hover:underline"
                >
                  {showPensScore ? "Hide exact score" : "+ Guess exact shootout score"}
                </button>
              )}

              {pensWinner && showPensScore && (
                <div className="flex items-center justify-center gap-3">
                  <Stepper
                    value={pensHome}
                    onChange={setPensHome}
                    disabled={pending}
                    label={`${home.name} pens`}
                  />
                  <span className="pb-8 text-xl font-bold text-muted-foreground">–</span>
                  <Stepper
                    value={pensAway}
                    onChange={setPensAway}
                    disabled={pending}
                    label={`${away.name} pens`}
                  />
                </div>
              )}
            </div>
          )}

          <Button
            size="lg"
            className="h-12 text-base"
            onClick={onSave}
            disabled={pending || (!dirty && hadPrediction)}
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <Check /> {hadPrediction ? "Update pick" : "Lock in pick"}
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
