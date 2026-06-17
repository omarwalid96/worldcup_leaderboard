import Link from "next/link";
import { Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LeagueLeaders } from "@/lib/leaderboard/queries";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Home-page spotlight for the current Main League leader(s) — crowned avatar(s).
 * Handles ties (dense rank 1 can be shared). Tapping a leader opens their profile.
 */
export function LeagueLeaders({ data }: { data: LeagueLeaders }) {
  const multiple = data.leaders.length > 1;

  return (
    <section className="bg-gold-gradient/0 relative overflow-hidden rounded-2xl border border-gold/30 bg-card/70 p-5">
      {/* warm glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,oklch(0.796_0.133_86.3/0.12),transparent)]" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gold">
          {data.leagueName} {multiple ? "leaders" : "leader"}
        </span>

        <div className="flex flex-wrap items-end justify-center gap-5">
          {data.leaders.map((l) => (
            <Link
              key={l.userId}
              href={`/u/${l.username}`}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="relative">
                <Crown
                  className="absolute -top-3.5 left-1/2 size-5 -translate-x-1/2 fill-gold text-gold drop-shadow"
                  aria-hidden
                />
                <Avatar className="size-16 border-2 border-gold shadow-lg shadow-gold/30">
                  {l.avatarUrl && <AvatarImage src={l.avatarUrl} alt={l.displayName} />}
                  <AvatarFallback className="bg-gold/15 text-lg font-semibold text-gold">
                    {initials(l.displayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="max-w-24 truncate text-sm font-semibold">
                {l.displayName}
              </span>
            </Link>
          ))}
        </div>

        <span className="font-numeric text-3xl leading-none text-gold">
          {data.points}
          <span className="ml-1 align-middle text-xs font-sans text-muted-foreground">
            pts
          </span>
        </span>
      </div>
    </section>
  );
}
