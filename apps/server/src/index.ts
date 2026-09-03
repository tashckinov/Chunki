import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { loadEnv } from './config/env.js';
import { waitForDatabase } from './db/pool.js';
import { gradeRoutes } from './routes/grade.js';
import { authRoutes } from './modules/auth/routes.js';
import { collectionsRoutes } from './modules/collections/routes.js';
import { chunksRoutes } from './modules/chunks/routes.js';
import { getGradingProvider } from './grading/index.js';

async function main() {
  const env = loadEnv();

  await waitForDatabase();

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });

  app.get('/api/health', async () => ({ ok: true, gradingProvider: getGradingProvider().name }));

  await app.register(gradeRoutes, { prefix: '/api/grade' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(collectionsRoutes, { prefix: '/api/collections' });
  await app.register(chunksRoutes, { prefix: '/api/chunks' });

  // 0.0.0.0 (not the Fastify default of 127.0.0.1) so the port mapping from
  // Docker Compose / a container host can actually reach it.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
