import Link from "next/link";
import {
  Trophy,
  Zap,
  Target,
  TrendingUp,
  Bell,
  Flame,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";

const features = [
  {
    icon: Target,
    title: "Predict every scoreline",
    desc: "Call the exact result before kickoff. Picks lock the moment the whistle blows — no take-backs.",
  },
  {
    icon: TrendingUp,
    title: "Live animated leaderboard",
    desc: "Watch the table reshuffle in real time as results land. Rank arrows, podium, count-up points.",
  },
  {
    icon: Flame,
    title: "Streaks & double-downs",
    desc: "Build a hot streak, double down once a matchday, earn badges, and climb the levels.",
  },
  {
    icon: Bell,
    title: "Matchday alerts",
    desc: "“Lock your pick in 1 hour.” “You nailed the exact score.” “You climbed to #2.”",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="bg-pitch relative flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Brand />
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5">
        <section className="flex flex-col items-center pt-12 text-center sm:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1 text-xs font-medium text-live">
            <span className="size-1.5 rounded-full bg-live animate-live-pulse" />
            World Cup 2026 is LIVE · Jun 11 – Jul 19
          </div>

          <h1 className="font-display mt-6 max-w-3xl text-balance text-5xl leading-[0.92] sm:text-7xl">
            Out-predict your friends.
            <br />
            <span className="text-gold-gradient">Own the table.</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            GroupStage is a private prediction league for the 2026 World Cup.
            Call the scorelines, rack up points, and rise up an animated
            leaderboard that updates the second the final whistle goes.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-12 px-6 text-base">
              <Link href="/login">
                Enter the league
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-base">
              <Link href="/leaderboard">Peek at the table</Link>
            </Button>
          </div>

          {/* Quick stat strip */}
          <dl className="mt-12 grid w-full max-w-md grid-cols-3 gap-4 text-center">
            {[
              { k: "104", v: "matches" },
              { k: "48", v: "teams" },
              { k: "5 pts", v: "exact score" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border bg-card/40 py-4 backdrop-blur">
                <dt className="font-numeric text-4xl text-gold">{s.k}</dt>
                <dd className="text-xs uppercase tracking-wide text-muted-foreground">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section className="grid w-full grid-cols-1 gap-4 py-16 sm:grid-cols-2 lg:py-24">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border bg-card/50 p-6 backdrop-blur transition-colors hover:border-primary/40"
            >
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Scoring quick-reference */}
        <section className="mb-20 w-full rounded-2xl border bg-card/50 p-6 backdrop-blur sm:p-8">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap className="size-4 text-gold" />
            How points work
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { pts: "5", label: "Exact scoreline", tone: "text-gold" },
              { pts: "3", label: "Result + goal diff", tone: "text-primary" },
              { pts: "1", label: "Correct result", tone: "text-foreground" },
              { pts: "×2", label: "Double-down match", tone: "text-gold" },
            ].map((r) => (
              <div key={r.label} className="rounded-xl bg-background/40 p-4">
                <div className={`font-numeric text-4xl ${r.tone}`}>
                  {r.pts}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{r.label}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="size-3.5" /> GroupStage
        </span>
        <span>A private league. Bragging rights only.</span>
      </footer>
    </div>
  );
}
