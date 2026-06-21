import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/session";
import { PushSettings } from "@/components/notifications/push-settings";
import { AvatarUpload } from "@/components/avatar/avatar-upload";
import { NameSettings } from "@/components/profile/name-settings";
import { QuoteSettings } from "@/components/profile/quote-settings";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

interface NotifPrefs {
  lockReminder: boolean;
  scoreHit: boolean;
  rankClimb: boolean;
  gameChallenge: boolean;
  nudge: boolean;
}

function parseNotifPrefs(raw: unknown): NotifPrefs {
  const defaults: NotifPrefs = {
    lockReminder: true,
    scoreHit: true,
    rankClimb: true,
    gameChallenge: true,
    nudge: true,
  };
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  return {
    lockReminder: r.lockReminder !== false,
    scoreHit: r.scoreHit !== false,
    rankClimb: r.rankClimb !== false,
    gameChallenge: r.gameChallenge !== false,
    nudge: r.nudge !== false,
  };
}

export default async function SettingsPage() {
  const profile = await requireProfile();

  const vapidPublicKey = env.vapidPublicKey ?? "";
  const initialSubscribed = Boolean(profile.pushSubscription);
  const initialPrefs = parseNotifPrefs(profile.notifPrefs);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and notification preferences.
        </p>
      </div>

      <NameSettings
        currentName={profile.displayName}
        username={profile.username}
      />

      <QuoteSettings currentQuote={profile.quote ?? null} />

      <AvatarUpload
        currentUrl={profile.avatarUrl}
        displayName={profile.displayName}
      />

      <PushSettings
        vapidPublicKey={vapidPublicKey}
        initialSubscribed={initialSubscribed}
        initialPrefs={initialPrefs}
      />
    </div>
  );
}
