import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in? Skip the form.
  if (isSupabaseConfigured) {
    const profile = await getSessionProfile();
    if (profile) redirect("/dashboard");
  }

  return (
    <div className="bg-pitch flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/">
          <Brand />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <Card className="w-full max-w-sm border-border/60 bg-card/70 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to make your picks and check the table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured ? (
              <LoginForm />
            ) : (
              <p className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-3 text-sm text-foreground/80">
                Auth isn&apos;t configured yet. Add your Supabase keys to{" "}
                <code className="font-mono text-xs">.env.local</code> to enable sign-in.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
