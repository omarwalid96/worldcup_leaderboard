"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Plus, LogIn, Users, Crown, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createLeague, joinLeague, leaveLeague } from "@/lib/leagues/actions";
import type { LeagueSummary } from "@/lib/leagues/queries";

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy.");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-mono text-xs font-semibold tracking-wider transition-colors hover:bg-accent"
      aria-label="Copy invite code"
    >
      {code}
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function LeaguesManager({
  leagues,
  isAdmin,
}: {
  leagues: LeagueSummary[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function onJoin() {
    startTransition(async () => {
      const res = await joinLeague(joinCode);
      if (res.ok) {
        toast.success("Joined league!");
        setJoinCode("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't join.");
      }
    });
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createLeague(newName);
      if (res.ok) {
        toast.success("League created", { description: `Invite code: ${res.inviteCode}` });
        setNewName("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't create.");
      }
    });
  }

  function onLeave(id: string, name: string) {
    startTransition(async () => {
      const res = await leaveLeague(id);
      if (res.ok) {
        toast.success(`Left ${name}.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't leave.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* My leagues */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Your leagues</h2>
        {leagues.map((l) => (
          <Card key={l.id} className="border-border/60 bg-card/70">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 font-semibold">
                  {l.name}
                  {l.isDefault && (
                    <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold">
                      Main
                    </span>
                  )}
                  {l.isOwner && !l.isDefault && (
                    <Crown className="size-3.5 text-gold" aria-label="You own this" />
                  )}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" /> {l.memberCount}
                  </span>
                  <CopyCode code={l.inviteCode} />
                </span>
              </div>
              {!l.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onLeave(l.id, l.name)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="size-4" /> Leave
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Join a league */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Join a league</h2>
        <div className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
            className="h-10 font-mono uppercase tracking-wider"
            autoCapitalize="characters"
          />
          <Button onClick={onJoin} disabled={pending || !joinCode.trim()} className="h-10 shrink-0">
            {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Join
          </Button>
        </div>
      </section>

      {/* Create a league (admin only) */}
      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Create a league</h2>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="League name"
              className="h-10"
              maxLength={40}
            />
            <Button
              onClick={onCreate}
              disabled={pending || newName.trim().length < 2}
              className={cn("h-10 shrink-0")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Create
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
