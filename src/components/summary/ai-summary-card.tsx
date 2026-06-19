"use client";

import { useEffect, useState } from "react";
import { Maximize2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AiSummary } from "@/lib/summary/queries";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Home-page "AI Summary" card — shows the latest /recap published to
 * ai_summaries. Always visible; renders the multi-line recap (Arabic + emoji)
 * with a live "updated X ago". Hidden entirely until the first recap exists.
 */
export function AiSummaryCard({ summary }: { summary: AiSummary | null }) {
  // Relative time is client-only to avoid an SSR/now() hydration mismatch.
  const [ago, setAgo] = useState<string | null>(null);
  useEffect(() => {
    if (!summary) return;
    const tick = () => setAgo(timeAgo(summary.createdAt));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [summary]);

  if (!summary) return null;

  return (
    <Card className="border-gold/30 bg-card/70">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="inline-flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-gold" /> AI Summary
        </CardTitle>
        {ago && (
          <span className="text-[11px] text-muted-foreground/70">updated {ago}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {summary.body}
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold/80"
            >
              <Maximize2 className="size-3.5" />
              Read full recap
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="inline-flex items-center gap-2">
                <Sparkles className="size-4 text-gold" /> AI Summary
              </DialogTitle>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {summary.body}
            </p>
            {ago && (
              <p className="text-[11px] text-muted-foreground/70">Updated {ago}</p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
