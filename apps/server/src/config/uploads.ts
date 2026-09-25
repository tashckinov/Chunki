import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Uploaded admin assets (collection banners, character images) live on local
// disk — under a Docker-mounted volume in production (see docker-compose.yml's
// uploads_data volume). Relative to cwd, which is the server package root in
// local dev (`apps/server`, via `npm run dev -w apps/server`) and /app in the
// production container (see apps/server/Dockerfile's WORKDIR + CMD).
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Shared raw-upload size cap for every image upload route (banners,
// character full-body/emotion images) — one value so it can't drift between
// routes the way independently-declared per-route constants would.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Best-effort cleanup for a file previously served at a `/uploads/...` URL
 * (e.g. a banner/character image being replaced or its owning row deleted) —
 * never throws, since a missing/already-gone file (or a URL that isn't one
 * of ours) is never a reason to fail the request that triggered the cleanup.
 */
export async function deleteUploadedFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith('/uploads/')) return;
  const absolute = path.join(UPLOADS_DIR, url.slice('/uploads/'.length));
  try {
    await fs.unlink(absolute);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
    console.error('deleteUploadedFile failed', { url, message: err instanceof Error ? err.message : String(err) });
  }
}

// JPEG has no alpha channel — sharp flattens transparent source pixels onto
// black by default, which silently destroys transparency on PNG uploads.
// Preserve it by keeping alpha-bearing images as PNG; only genuinely opaque
// images get re-encoded to the smaller JPEG. Shared by every image upload
// route (banners, character images) so this behavior can't drift between them.
export async function resizeImage(original: Buffer, maxDimension: number): Promise<{ buffer: Buffer; extension: 'png' | 'jpg' }> {
  const image = sharp(original).resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true });
  const { hasAlpha } = await sharp(original).metadata();
  if (hasAlpha) {
    return { buffer: await image.png({ compressionLevel: 8 }).toBuffer(), extension: 'png' };
  }
  return { buffer: await image.jpeg({ quality: 82 }).toBuffer(), extension: 'jpg' };
}
