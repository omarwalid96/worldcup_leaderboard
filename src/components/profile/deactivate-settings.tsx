"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deactivateAccount } from "@/lib/profile/actions";

/**
 * Settings card to deactivate the account. Two-step inline confirm (no native
 * confirm dialog). On success the layout re-renders into the reactivate gate.
 */
export function DeactivateSettings() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function deactivate() {
    startTransition(async () => {
      const res = await deactivateAccount();
      if (res.ok) {
        toast.success("Account deactivated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't deactivate your account.");
        setConfirming(false);
      }
    });
  }

  return (
    <Card className="border-destructive/40 bg-card/70">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <UserX className="size-4 text-destructive" />
        <CardTitle className="text-base">Deactivate account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Hides you from everyone (leaderboard, profile, challenges) and blocks
          picks and games. You can activate back anytime by logging back in.
        </p>
        {confirming ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={deactivate}
              disabled={pending}
              className="h-10"
            >
              {pending ? <Loader2 className="animate-spin" /> : <UserX />} Yes,
              deactivate
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="h-10"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setConfirming(true)}
            className="h-10 self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <UserX /> Deactivate my account
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
