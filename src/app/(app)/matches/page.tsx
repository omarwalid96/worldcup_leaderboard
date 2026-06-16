import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Matches</h1>
      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CalendarDays className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Fixtures &amp; prediction cards arrive in Milestone 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
