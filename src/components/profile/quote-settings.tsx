"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Quote, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateQuote } from "@/lib/profile/actions";

/**
 * Lets a user set a short personal tagline (quote). When the user is the
 * league leader, the quote is displayed on the home page leader spotlight.
 */
export function QuoteSettings({ currentQuote }: { currentQuote: string | null }) {
  const router = useRouter();
  const [quote, setQuote] = useState(currentQuote ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = quote.trim() !== (currentQuote ?? "");

  function save() {
    startTransition(async () => {
      const res = await updateQuote(quote);
      if (res.ok) {
        toast.success("Quote saved");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't save your quote.");
      }
    });
  }

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Quote className="size-4 text-gold" />
        <CardTitle className="text-base">Your quote</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quote" className="text-xs text-muted-foreground">
            Shown on the home page when you&apos;re the league leader.
          </Label>
          <Textarea
            id="quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            maxLength={120}
            placeholder="Add a tagline…"
            rows={2}
            className="resize-none"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {quote.trim().length}/120 characters. Leave blank to remove your quote.
        </p>
        <Button onClick={save} disabled={pending || !dirty} className="h-10 self-start">
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save quote
        </Button>
      </CardContent>
    </Card>
  );
}
