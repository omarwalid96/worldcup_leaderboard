import "server-only";
import { cache } from "react";

/**
 * Request-scoped query timing, for the admin perf overlay.
 *
 * React's cache() gives us one store per server request (per render), so timings
 * from this render don't leak into another user's. Wrap any server query in
 * time("label", () => query) and it records the duration; the layout reads them
 * back with getTimings() and hands them to the overlay. Zero cost when unused.
 *
 * ponytail: cache() is the per-request store — no AsyncLocalStorage plumbing.
 */
export interface Timing {
  label: string;
  ms: number;
}

// One array per request. cache() memoizes the factory per render pass.
const store = cache((): Timing[] => []);

/** Time an async query and record it under `label`. Returns the query result. */
export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    store().push({ label, ms: Math.round((performance.now() - start) * 10) / 10 });
  }
}

/** All timings recorded so far this request. */
export function getTimings(): Timing[] {
  return store();
}
