"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { usernameToEmail, normalizeUsername } from "./usernames";

const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(1),
});

export interface AuthResult {
  error?: string;
}

/**
 * Log in with username + password. Maps the username to its synthetic email
 * and signs in via Supabase. On success, redirects to the dashboard.
 */
export async function loginAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid username and password." };
  }

  const username = normalizeUsername(parsed.data.username);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password: parsed.data.password,
  });

  if (error) {
    // Don't leak whether the username exists.
    return { error: "Incorrect username or password." };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
