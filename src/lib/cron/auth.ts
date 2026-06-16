import "server-only";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Authorizes a cron request. Vercel Cron sends the configured secret as a
 * Bearer token in the Authorization header. We also accept ?secret= for manual
 * triggering during setup. Returns true if authorized.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}
