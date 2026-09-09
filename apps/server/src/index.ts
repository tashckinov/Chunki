import 'dotenv/config';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import staticPlugin from '@fastify/static';
import { loadEnv } from './config/env.js';
import { UPLOADS_DIR } from './config/uploads.js';
import { waitForDatabase } from './db/pool.js';
import { gradeRoutes } from './routes/grade.js';
import { authRoutes } from './modules/auth/routes.js';
import { collectionsRoutes } from './modules/collections/routes.js';
import { chunksRoutes } from './modules/chunks/routes.js';
import { progressRoutes } from './modules/progress/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { getGradingProvider } from './grading/index.js';
import { getProductionJudgeProvider } from './openrouter/index.js';

async function main() {
  const env = loadEnv();

  await waitForDatabase();

  const app = Fastify({ logger: true });

  // @fastify/cors only allows GET/HEAD/POST by default — every PATCH/DELETE
  // route in this app (admin edits/deletes, in particular) would otherwise
  // fail the browser's CORS preflight with "Method ... not allowed by
  // Access-Control-Allow-Methods" from the cross-site GitHub Pages frontend.
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(cookie, { secret: env.SESSION_SECRET });

  // Publicly readable — banner images aren't sensitive, and a plain <img>
  // tag needs no CORS setup to just render across origins.
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  await app.register(staticPlugin, { root: UPLOADS_DIR, prefix: '/uploads/' });

  app.get('/api/health', async () => ({ ok: true, gradingProvider: getGradingProvider().name, productionJudgeProvider: getProductionJudgeProvider().name }));

  await app.register(gradeRoutes, { prefix: '/api/grade' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(collectionsRoutes, { prefix: '/api/collections' });
  await app.register(chunksRoutes, { prefix: '/api/chunks' });
  await app.register(progressRoutes, { prefix: '/api/progress' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // 0.0.0.0 (not the Fastify default of 127.0.0.1) so the port mapping from
  // Docker Compose / a container host can actually reach it.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
