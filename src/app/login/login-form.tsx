"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LogIn, Loader2 } from "lucide-react";
import { loginAction, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <>
          <LogIn /> Sign in
        </>
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<AuthResult, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="your_username"
          required
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          className="h-11"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
