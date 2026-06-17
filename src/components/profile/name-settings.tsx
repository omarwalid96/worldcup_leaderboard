"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPen, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDisplayName } from "@/lib/profile/actions";

/**
 * Lets a user change the display name shown across the app. The @username
 * (login handle + profile URL) is fixed and shown read-only.
 */
export function NameSettings({
  currentName,
  username,
}: {
  currentName: string;
  username: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== currentName && name.trim().length >= 2;

  function save() {
    startTransition(async () => {
      const res = await updateDisplayName(name);
      if (res.ok) {
        toast.success("Name updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't update your name.");
      }
    });
  }

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <UserPen className="size-4 text-gold" />
        <CardTitle className="text-base">Display name</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName" className="text-xs text-muted-foreground">
            Shown on the leaderboard, your profile, and your picks.
          </Label>
          <Input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Your name"
            className="h-10"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Handle: <span className="font-medium text-foreground">@{username}</span>{" "}
          (your login — can&apos;t be changed)
        </p>
        <Button onClick={save} disabled={pending || !dirty} className="h-10 self-start">
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save name
        </Button>
      </CardContent>
    </Card>
  );
}
