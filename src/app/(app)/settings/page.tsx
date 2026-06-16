import type { Metadata } from "next";
import { Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <SettingsIcon className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Notification preferences arrive in Milestone 8.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
