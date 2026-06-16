import Link from "next/link";
import { Trophy, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-pitch flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-gold/15 text-gold">
        <Trophy className="size-8" />
      </span>
      <h1 className="font-display mt-6 text-5xl text-gold">404</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        This page is offside. The match you&apos;re looking for doesn&apos;t exist.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">
          <Home /> Back to home
        </Link>
      </Button>
    </div>
  );
}
