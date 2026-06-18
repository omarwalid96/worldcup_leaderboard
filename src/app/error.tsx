"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary. Catches render/data errors in the app tree. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for debugging; real telemetry would go here.
    console.error(error);
  }, [error]);

  return (
    <div className="bg-pitch flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-destructive/15 text-destructive">
        <AlertTriangle className="size-8" />
      </span>
      <h1 className="font-display mt-6 text-3xl">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        We hit a snag loading this page. Give it another go.
      </p>
      <Button onClick={reset} className="mt-6">
        <RotateCcw /> Try again
      </Button>

      {/* TEMP diagnostic: show the error so a tester can screenshot it. */}
      {(error?.message || error?.digest) && (
        <pre className="mt-6 max-w-sm overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-card/60 p-3 text-left text-[11px] text-muted-foreground">
          {error.digest ? `digest: ${error.digest}\n` : ""}
          {error.message ?? ""}
        </pre>
      )}
    </div>
  );
}
