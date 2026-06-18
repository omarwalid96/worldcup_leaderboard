"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Reuse the existing public `avatars` bucket under a sponsors/ prefix — no new
// bucket to provision.
const BUCKET = "avatars";
const MAX_SPONSORS = 10;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB (portrait sponsor images)
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface SponsorRow {
  id: string;
  imageUrl: string;
}

export interface SponsorResult {
  ok: boolean;
  error?: string;
  /** The newly-created row, on a successful upload. */
  row?: SponsorRow;
}

/** All sponsor images, newest first. */
export async function listSponsors(): Promise<SponsorRow[]> {
  const rows = await db
    .select({ id: sponsors.id, imageUrl: sponsors.imageUrl })
    .from(sponsors)
    .orderBy(desc(sponsors.createdAt));
  return rows;
}

/**
 * Upload a sponsor image (any member). Rejected when the gallery is already
 * full (10). Validates type + size server-side. Returns ok/error.
 */
export async function uploadSponsor(formData: FormData): Promise<SponsorResult> {
  const profile = await requireProfile();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sponsors);
  if (n >= MAX_SPONSORS) {
    return { ok: false, error: `Gallery is full (${MAX_SPONSORS}). Remove one first.` };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "Please choose a PNG, JPG, WEBP, or GIF image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be smaller than 3MB." };
  }

  const ext = EXT_BY_TYPE[file.type] ?? "png";
  const path = `sponsors/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  // Use the service-role client: the avatars-bucket storage RLS scopes writes to
  // a <userId>/ folder, but sponsors is a shared communal gallery under a
  // sponsors/ prefix. This action already enforces auth + the 10-cap, so trusted
  // server-side upload is appropriate.
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: true });
  if (uploadError) {
    return { ok: false, error: "Upload failed. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const [inserted] = await db
    .insert(sponsors)
    .values({ imageUrl: publicUrl, uploadedBy: profile.id })
    .returning({ id: sponsors.id, imageUrl: sponsors.imageUrl });

  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  return { ok: true, row: inserted };
}

/** Remove a sponsor image (any member can remove any). Also deletes the file. */
export async function removeSponsor(id: string): Promise<SponsorResult> {
  await requireProfile();

  const [row] = await db
    .select({ imageUrl: sponsors.imageUrl })
    .from(sponsors)
    .where(eq(sponsors.id, id))
    .limit(1);

  await db.delete(sponsors).where(eq(sponsors.id, id));

  // Best-effort: remove the stored file too (path is everything after the bucket).
  if (row?.imageUrl) {
    const marker = `/${BUCKET}/`;
    const idx = row.imageUrl.indexOf(marker);
    if (idx !== -1) {
      const path = row.imageUrl.slice(idx + marker.length);
      try {
        await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
      } catch {
        // ignore storage cleanup failure — the DB row is gone, which is what matters
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  return { ok: true };
}
