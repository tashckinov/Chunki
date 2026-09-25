import fs from 'node:fs/promises';
import path from 'node:path';

// Uploaded admin assets (collection banners, character images) live on local
// disk — under a Docker-mounted volume in production (see docker-compose.yml's
// uploads_data volume). Relative to cwd, which is the server package root in
// local dev (`apps/server`, via `npm run dev -w apps/server`) and /app in the
// production container (see apps/server/Dockerfile's WORKDIR + CMD).
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

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
