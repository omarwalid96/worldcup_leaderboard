"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface AvatarResult {
  ok: boolean;
  url?: string | null;
  error?: string;
}

/** Re-render the surfaces that show the user's avatar. */
function revalidateAvatarSurfaces() {
  revalidatePath("/", "layout");
}

/**
 * Uploads a new avatar image for the current user to Supabase Storage and
 * persists its public URL on the profile. Validates type + size server-side.
 */
export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const profile = await requireProfile();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "Please choose a PNG, JPG, WEBP, or GIF image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be smaller than 2MB." };
  }

  const ext = EXT_BY_TYPE[file.type] ?? "png";
  const path = `${profile.id}/avatar-${Date.now()}.${ext}`;

  const supabase = await createSupabaseServerClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    return { ok: false, error: "Upload failed. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  await db
    .update(profiles)
    .set({ avatarUrl: publicUrl })
    .where(eq(profiles.id, profile.id));

  revalidateAvatarSurfaces();
  return { ok: true, url: publicUrl };
}

/** Clears the current user's avatar URL. */
export async function removeAvatar(): Promise<AvatarResult> {
  const profile = await requireProfile();

  await db
    .update(profiles)
    .set({ avatarUrl: null })
    .where(eq(profiles.id, profile.id));

  revalidateAvatarSurfaces();
  return { ok: true, url: null };
}
