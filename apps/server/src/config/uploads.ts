import path from 'node:path';

// Uploaded admin assets (currently just collection banners) live on local
// disk — under a Docker-mounted volume in production (see docker-compose.yml's
// uploads_data volume). Relative to cwd, which is the server package root in
// local dev (`apps/server`, via `npm run dev -w apps/server`) and /app in the
// production container (see apps/server/Dockerfile's WORKDIR + CMD).
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
