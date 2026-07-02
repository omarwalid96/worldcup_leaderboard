"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { reactivateAccount } from "@/lib/profile/actions";

/**
 * The only screen a deactivated user sees while logged in. Reactivating clears
 * the flag and reloads them back into the full app.
 */
export function DeactivatedGate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function activate() {
    startTransition(async () => {
      const res = await reactivateAccount();
      if (res.ok) {
        toast.success("Welcome back!");
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't reactivate your account.");
      }
    });
  }

  return (
    <Card className="border-border/60 bg-card/70 text-center">
      <CardHeader>
        <CardTitle className="font-display text-xl">Account deactivated</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Your account is hidden from everyone and you can&apos;t make picks or
          play games. You can activate back anytime to come back.
        </p>
        <Button onClick={activate} disabled={pending} className="h-11">
          {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Activate my
          account
        </Button>
      </CardContent>
    </Card>
  );
}
