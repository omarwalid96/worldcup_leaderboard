import Link from "next/link";
import { Brand } from "@/components/brand";
import { BottomNav, SideNav } from "@/components/layout/app-nav";
import { HypeBanner } from "@/components/layout/hype-banner";
import { UserMenu } from "@/components/layout/user-menu";
import { requireProfile } from "@/lib/auth/session";
import { SwRegister } from "@/components/sw-register";
import { TeamHype } from "@/components/match/team-hype";
import { LiveIsland } from "@/components/match/live-island";
import { getTodaysTeamMatch } from "@/lib/matches/team-hype";
import { getNextKickoff } from "@/lib/matches/queries";
import { NativeInit } from "@/components/native-init";
import { PerfOverlay } from "@/components/perf/perf-overlay";
import { time, getTimings } from "@/lib/perf/timing";

/**
 * Renders AFTER {children}, so getTimings() includes the page's instrumented
 * queries (the layout JSX is evaluated before children resolve, but this server
 * component reads the request-scoped store once children have run). Admin only.
 */
async function PerfBar({ serverStartMs }: { serverStartMs: number }) {
  const timings = getTimings();
  return (
    <PerfOverlay
      serverTimings={timings}
      serverTotalMs={Math.round((performance.now() - serverStartMs) * 10) / 10}
    />
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const serverStartMs = performance.now();
  const profile = await time("layout: auth + profile", () => requireProfile());
  const [egyptMatch, brazilMatch, nextKickoff] = await Promise.all([
    time("layout: egypt hype", () => getTodaysTeamMatch("egypt")),
    time("layout: brazil hype", () => getTodaysTeamMatch("brazil")),
    time("layout: next kickoff", () => getNextKickoff()),
  ]);

  return (
    <div className="bg-pitch min-h-dvh">
      {/* Top bar. pt = env(safe-area-inset-top) so the bar clears the iOS
          status bar / notch in standalone PWA mode (black-translucent draws
          content edge-to-edge under the clock). Android reports 0 → no change. */}
      <header
        className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard">
            <Brand />
          </Link>
          <UserMenu
            displayName={profile.displayName}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
        </div>
      </header>

      {/* Always-on scrolling hype billboard under the bar. */}
      <HypeBanner />

      {/* Google-Sports-style live pill — auto-shows under the bar when a match
          is in play, hidden otherwise. Self-contained client component. */}
      <LiveIsland nextKickoffMs={nextKickoff ? nextKickoff.getTime() : null} />

      {/* Match-day hype — only renders on the day of that country's game. */}
      {egyptMatch && <TeamHype match={egyptMatch} />}
      {brazilMatch && <TeamHype match={brazilMatch} />}

      <div className="mx-auto flex max-w-5xl gap-8 px-4 py-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-20 hidden h-fit w-44 shrink-0 md:block">
          <SideNav />
        </aside>

        {/* Page content; bottom padding leaves room for the mobile tab bar.
            PerfBar (admin only) renders right after {children} so the page's
            instrumented queries are recorded by the time it reads them. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-6">
          {children}
          {profile.isAdmin && <PerfBar serverStartMs={serverStartMs} />}
        </main>
      </div>

      <BottomNav />
      <SwRegister />
      {/* Native-only: push registration, hardware back button, haptics.
          Completely inert on web — guarded by Capacitor.isNativePlatform(). */}
      <NativeInit />
    </div>
  );
}
