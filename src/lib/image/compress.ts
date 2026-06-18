/**
 * Downscale + re-encode an image to JPEG in the browser before upload.
 *
 * Why: Next.js Server Actions cap the request body (default ~1MB), and iPhone
 * camera photos are routinely 4-8MB (often HEIC), which would otherwise throw a
 * "Server Components render" error before our own validation runs. Compressing
 * client-side keeps the upload small and converts whatever the picker gave us
 * (incl. HEIC, which the browser can decode) to a portable JPEG.
 *
 * Falls back to the original File if the browser can't decode it, so the server
 * can still validate/reject gracefully.
 */
export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.82,
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    return new File([blob], "upload.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
