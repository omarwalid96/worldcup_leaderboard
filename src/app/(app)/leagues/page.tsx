import type { Metadata } from "next";
import { Users } from "lucide-react";
import { LeaguesManager } from "@/components/leagues/leagues-manager";
import { requireProfile } from "@/lib/auth/session";
import { getMyLeagues } from "@/lib/leagues/queries";

export const metadata: Metadata = { title: "Leagues" };

export default async function LeaguesPage() {
  const profile = await requireProfile();
  const leagues = await getMyLeagues(profile.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="size-6 text-gold" />
          Leagues
        </h1>
        <p className="text-sm text-muted-foreground">
          Join a friend&apos;s league with their code, or compete in the Main League.
        </p>
      </div>

      <LeaguesManager leagues={leagues} isAdmin={profile.isAdmin} />
    </div>
  );
}
