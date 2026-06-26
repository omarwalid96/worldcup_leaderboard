"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Trophy, Gamepad2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIncomingChallengeCount } from "@/lib/games/actions";

const items = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/matches", label: "Matches", icon: CalendarDays },
  { href: "/leaderboard", label: "Table", icon: Trophy },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/profile", label: "Profile", icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Poll the pending-incoming-challenge count so a badge on the Games tab shows
 * invites instantly without opening the tab. Cheap COUNT query; polls on mount,
 * every 20s, and on tab focus. Shared by both nav variants.
 *
 * Deps are []: the nav is mounted once in the app layout and persists across
 * navigations, so the poll keeps running — no need to restart it on every route
 * change (that fired a server action on EVERY tab switch, adding nav latency).
 */
function useInvites() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void getIncomingChallengeCount().then((n) => {
        if (alive) setCount(n);
      });
    };
    tick();
    const id = setInterval(tick, 20_000);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return count;
}

/** Mobile-first bottom tab bar. */
export function BottomNav() {
  const pathname = usePathname();
  const invites = useInvites();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 backdrop-blur-lg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <it.icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                  {it.href === "/games" && invites > 0 && (
                    <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-white">
                      {invites}
                    </span>
                  )}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop sidebar links. */
export function SideNav() {
  const pathname = usePathname();
  const invites = useInvites();
  return (
    <nav className="hidden md:block">
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <it.icon className="size-4.5" strokeWidth={active ? 2.5 : 2} />
                {it.label}
                {it.href === "/games" && invites > 0 && (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-5 text-white">
                    {invites}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
