"use client";

import { useEffect, useState, useTransition } from "react";
import { Maximize2, MessageCircle, Send, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AiSummary } from "@/lib/summary/queries";
import { submitComment } from "@/lib/summary/comments-actions";
import { MAX_COMMENT_CHARS, type SummaryComment } from "@/lib/summary/comments";
import { RecapBody } from "@/components/summary/recap-body";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold/15 text-[11px] font-semibold text-gold">
      {initials(name)}
    </span>
  );
}

function CommentsSection({
  summaryId,
  currentUserId,
  initial,
  myComment,
}: {
  summaryId: string;
  currentUserId: string;
  initial: SummaryComment[];
  myComment: string | null;
}) {
  const [comments, setComments] = useState(initial);
  const [draft, setDraft] = useState(myComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasMine = comments.some((c) => c.userId === currentUserId);
  const others = comments.filter((c) => c.userId !== currentUserId);
  const mine = comments.find((c) => c.userId === currentUserId);

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await submitComment(summaryId, draft);
      if (!res.ok) {
        setError(res.error ?? "Couldn't post. Try again.");
        return;
      }
      if (res.comments) setComments(res.comments);
    });
  }

  return (
    <div className="space-y-3">
      {/* My comment / composer — at the TOP so it stays visible above the
          keyboard. scrollIntoView on focus keeps it in view on mobile. */}
      <div className="rounded-lg border border-gold/25 bg-gold/5 p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-gold/90">
          {hasMine ? "Your comment (editable)" : "Add your comment"}
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_CHARS))}
          onFocus={(e) =>
            // ponytail: nudge the field into view when the mobile keyboard opens
            setTimeout(() => e.target.scrollIntoView({ block: "center" }), 300)
          }
          maxLength={MAX_COMMENT_CHARS}
          rows={2}
          placeholder="Drop your hot take…"
          className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-gold/50"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {draft.length}/{MAX_COMMENT_CHARS}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={pending || !draft.trim() || draft.trim() === mine?.body}
            className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-3.5" />
            {hasMine ? "Update" : "Post"}
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      </div>

      {/* Everyone else's comments */}
      {others.length > 0 && (
        <ul className="space-y-2.5">
          {others.map((c) => (
            <li key={c.userId} className="flex items-start gap-2.5">
              <Avatar url={c.avatarUrl} name={c.displayName} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {c.displayName}
                </p>
                <p className="break-words text-sm text-muted-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Home-page "AI Summary" card — shows the latest /recap published to
 * ai_summaries. Always visible; renders the multi-line recap (Arabic + emoji)
 * with a live "updated X ago". The full-recap popup also hosts the comments
 * section (one editable comment per user, shown to everyone; read back by the
 * /recap skill on its next run). Hidden entirely until the first recap exists.
 */
export function AiSummaryCard({
  summary,
  currentUserId,
  comments,
  myComment,
}: {
  summary: AiSummary | null;
  currentUserId: string;
  comments: SummaryComment[];
  myComment: string | null;
}) {
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
      <CardContent className="space-y-2.5">
        <div className="relative max-h-[8.75rem] overflow-hidden">
          <RecapBody body={summary.body} compact />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card/95 to-transparent"
            aria-hidden
          />
        </div>
        <div className="flex items-center gap-4">
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
              <RecapBody body={summary.body} />
              {ago && (
                <p className="text-[11px] text-muted-foreground/70">Updated {ago}</p>
              )}
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold/80"
              >
                <MessageCircle className="size-3.5" />
                Comments
                {comments.length > 0 && (
                  <span className="text-muted-foreground/70">({comments.length})</span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="inline-flex items-center gap-2">
                  <MessageCircle className="size-4 text-gold" /> Comments
                </DialogTitle>
              </DialogHeader>
              <CommentsSection
                summaryId={summary.id}
                currentUserId={currentUserId}
                initial={comments}
                myComment={myComment}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
