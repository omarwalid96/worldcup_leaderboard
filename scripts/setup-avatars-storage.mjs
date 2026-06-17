// One-off, idempotent setup for the `avatars` Supabase Storage bucket.
//
//   - Creates a public-read bucket named `avatars` (ignores "already exists").
//   - Applies storage.objects RLS policies so authenticated users can manage
//     objects under their own `<userId>/...` folder, and anyone can read.
//
// Run with:  node --env-file=.env.local scripts/setup-avatars-storage.mjs
//
// supabase-js needs a WebSocket polyfill under Node 20:
import ws from "ws";
globalThis.WebSocket ??= ws;

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL",
  );
  process.exit(1);
}

const BUCKET = "avatars";

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Create the bucket (idempotent).
  const { error: bucketErr } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "2MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    throw bucketErr;
  }
  console.log(
    bucketErr ? `Bucket "${BUCKET}" already exists.` : `Bucket "${BUCKET}" created.`,
  );

  // 2. Storage RLS policies on storage.objects, scoped to bucket_id='avatars'.
  //    Path convention: avatars/<userId>/<filename> — first path segment must
  //    equal the caller's auth uid for write operations. Read is public.
  const sql = postgres(DATABASE_URL, { prepare: false });
  try {
    const statements = [
      `drop policy if exists "avatars public read" on storage.objects`,
      `drop policy if exists "avatars user insert" on storage.objects`,
      `drop policy if exists "avatars user update" on storage.objects`,
      `drop policy if exists "avatars user delete" on storage.objects`,
      `create policy "avatars public read" on storage.objects
         for select using (bucket_id = 'avatars')`,
      `create policy "avatars user insert" on storage.objects
         for insert to authenticated
         with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)`,
      `create policy "avatars user update" on storage.objects
         for update to authenticated
         using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)`,
      `create policy "avatars user delete" on storage.objects
         for delete to authenticated
         using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)`,
    ];
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    console.log("Storage RLS policies applied.");
  } finally {
    await sql.end();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
