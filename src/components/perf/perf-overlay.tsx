"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Gauge } from "lucide-react";
import type { Timing } from "@/lib/perf/timing";

/**
 * Admin-only perf bar pinned at the top. Shows the server timings captured by
 * the time the layout's PerfBar renders — reliably the auth + layout queries
 * (the dominant cost) — plus the client render time (mount → next paint),
 * re-measured on every route change.
 *
 * Note: per-page queries aren't always itemized — React renders the page
 * subtree concurrently with the PerfBar sibling, so a page's awaits may finish
 * after the bar reads the store. The "server" total still reflects auth+layout,
 * which is where the latency actually is. Admin only (gated in the layout).
 */
export function PerfOverlay({
  serverTimings,
  serverTotalMs,
}: {
  serverTimings: Timing[];
  serverTotalMs: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [renderMs, setRenderMs] = useState<number | null>(null);

  // Client render time: from this effect (post-mount) to the next paint frame.
  // Re-runs on every navigation (pathname dep), so it reflects the page just
  // navigated to, not the first load.
  useEffect(() => {
    const start = performance.now();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setRenderMs(Math.round((performance.now() - start) * 10) / 10);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  const slow = serverTotalMs > 400;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-2 pt-1 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-5xl rounded-b-lg border border-border/60 bg-background/95 px-3 py-1 font-numeric text-[11px] tabular-nums shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2"
        >
          <Gauge className="size-3.5 text-gold" />
          <span className={slow ? "font-bold text-destructive" : "text-foreground"}>
            auth+layout {serverTotalMs}ms
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-foreground">
            render {renderMs == null ? "…" : `${renderMs}ms`}
          </span>
          <span className="ml-auto truncate text-muted-foreground">{pathname}</span>
          {open ? (
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>

        {open && (
          <ul className="mt-1 flex flex-col gap-0.5 border-t border-border/40 pt-1">
            {serverTimings.length === 0 ? (
              <li className="text-muted-foreground">no timings recorded</li>
            ) : (
              serverTimings.map((t, i) => (
                <li key={`${t.label}-${i}`} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">{t.label}</span>
                  <span className={t.ms > 200 ? "text-destructive" : "text-foreground"}>
                    {t.ms}ms
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
