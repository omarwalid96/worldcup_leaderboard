"use client";

import { useState, useEffect, useTransition } from "react";
import { Bell, BellOff, BellRing, Trophy, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  savePushSubscription,
  removePushSubscription,
  updateNotifPrefs,
} from "@/lib/notifications/actions";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/notifications/client";

interface NotifPrefs {
  lockReminder: boolean;
  scoreHit: boolean;
  rankClimb: boolean;
}

interface PushSettingsProps {
  vapidPublicKey: string;
  initialSubscribed: boolean;
  initialPrefs: NotifPrefs;
}

export function PushSettings({
  vapidPublicKey,
  initialSubscribed,
  initialPrefs,
}: PushSettingsProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [prefs, setPrefs] = useState<NotifPrefs>(initialPrefs);
  // Initialize to stable SSR-safe defaults; read real browser state after mount
  // so server and client render the same HTML (avoids hydration mismatch).
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Treat as supported until mounted to keep SSR/first-paint consistent.
  const pushSupported = !mounted || isPushSupported();

  function handleEnable() {
    startTransition(async () => {
      try {
        const sub = await subscribeToPush(vapidPublicKey);
        if (!sub) {
          const perm =
            typeof window !== "undefined" && "Notification" in window
              ? Notification.permission
              : "default";
          setPermission(perm as NotificationPermission);
          if (perm === "denied") {
            toast.error("Notifications blocked", {
              description: "Enable notifications in your browser settings to proceed.",
            });
          } else {
            toast.error("Could not subscribe to notifications.");
          }
          return;
        }
        await savePushSubscription(sub);
        setSubscribed(true);
        setPermission("granted");
        toast.success("Push notifications enabled!");
      } catch (err) {
        console.error(err);
        toast.error("Failed to enable notifications.");
      }
    });
  }

  function handleDisable() {
    startTransition(async () => {
      try {
        await unsubscribeFromPush();
        await removePushSubscription();
        setSubscribed(false);
        toast.success("Push notifications disabled.");
      } catch (err) {
        console.error(err);
        toast.error("Failed to disable notifications.");
      }
    });
  }

  function handlePrefChange(key: keyof NotifPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    startTransition(async () => {
      try {
        await updateNotifPrefs(next);
      } catch (err) {
        console.error(err);
        setPrefs(prefs); // revert on error
        toast.error("Failed to save preference.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Enable / status card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gold">
            <Bell className="size-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Get notified about picks, scores, and your league ranking.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!pushSupported ? (
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported in this browser. Try installing
              Eznii Ya Dawly as an app for full notification support.
            </p>
          ) : permission === "denied" ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Notifications are blocked by your browser. To enable them, go to your
              browser&apos;s site settings and allow notifications for this site,
              then reload the page.
            </div>
          ) : subscribed ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-success">
                <BellRing className="size-4" />
                Notifications are active
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable}
                disabled={isPending}
              >
                <BellOff className="size-4" />
                Disable
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Enable push notifications to stay in the loop.
              </p>
              <Button size="sm" onClick={handleEnable} disabled={isPending}>
                <Bell className="size-4" />
                Enable
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Types</CardTitle>
          <CardDescription>
            Choose which events send you a notification. Changes save instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60">
          {/* Lock reminder */}
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pref-lock" className="font-medium leading-snug cursor-pointer">
                Lock reminder
              </Label>
              <p className="text-xs text-muted-foreground">
                Remind me 1 hour before a match I haven&apos;t predicted.
              </p>
            </div>
            <Switch
              id="pref-lock"
              checked={prefs.lockReminder}
              onCheckedChange={(v) => handlePrefChange("lockReminder", v)}
              disabled={isPending}
            />
          </div>

          {/* Score hit */}
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pref-score" className="font-medium leading-snug cursor-pointer flex items-center gap-1.5">
                <Trophy className="size-3.5 text-gold" />
                Exact score bonus
              </Label>
              <p className="text-xs text-muted-foreground">
                Alert me when I nail the exact scoreline.
              </p>
            </div>
            <Switch
              id="pref-score"
              checked={prefs.scoreHit}
              onCheckedChange={(v) => handlePrefChange("scoreHit", v)}
              disabled={isPending}
            />
          </div>

          {/* Rank climb */}
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pref-rank" className="font-medium leading-snug cursor-pointer flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-success" />
                Rank climbed
              </Label>
              <p className="text-xs text-muted-foreground">
                Tell me when I move up the leaderboard.
              </p>
            </div>
            <Switch
              id="pref-rank"
              checked={prefs.rankClimb}
              onCheckedChange={(v) => handlePrefChange("rankClimb", v)}
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
