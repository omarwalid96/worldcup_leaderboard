"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPensResult, clearPensResult } from "@/lib/admin/match-actions";

/**
 * Admin-only panel on a knockout match page to record the penalty shootout
 * result (the data source can't report it). Grading picks it up next run.
 */
export function MatchAdmin({
  matchId,
  homeName,
  awayName,
  wentToPens,
  pensHome,
  pensAway,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
  wentToPens: boolean;
  pensHome: number | null;
  pensAway: number | null;
}) {
  const router = useRouter();
  const [h, setH] = useState(pensHome ?? 5);
  const [a, setA] = useState(pensAway ?? 4);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await setPensResult({ matchId, pensHome: h, pensAway: a });
      if (res.ok) {
        toast.success("Shootout result saved", {
          description: "Re-grade (with a fresh backup) to apply the pens bonus.",
        });
        router.refresh();
      } else toast.error(res.error ?? "Couldn't save.");
    });
  }

  function clear() {
    startTransition(async () => {
      const res = await clearPensResult(matchId);
      if (res.ok) {
        toast.success("Shootout result cleared");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't clear.");
    });
  }

  return (
    <Card className="border-info/40 bg-info/5">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Shield className="size-4 text-info" />
        <CardTitle className="text-base">Admin · penalty result</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          The data feed can&apos;t report shootouts. Enter the actual result here;
          it grades the pens bonus on the next run.
          {wentToPens && (
            <span className="ml-1 font-medium text-info">
              Current: {pensHome}–{pensAway}.
            </span>
          )}
        </p>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{homeName}</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={h}
              onChange={(e) => setH(Number(e.target.value))}
              className="h-9 w-20"
            />
          </div>
          <span className="pb-2 text-muted-foreground">–</span>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{awayName}</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={a}
              onChange={(e) => setA(Number(e.target.value))}
              className="h-9 w-20"
            />
          </div>
          <Button onClick={save} disabled={pending || h === a} className="h-9">
            {pending ? <Loader2 className="animate-spin" /> : "Save"}
          </Button>
          {wentToPens && (
            <Button variant="ghost" onClick={clear} disabled={pending} className="h-9">
              Clear
            </Button>
          )}
        </div>
        {h === a && (
          <p className="text-xs text-destructive">A shootout can&apos;t be a draw.</p>
        )}
      </CardContent>
    </Card>
  );
}
