import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listComicCollections, listCollectionComics } from './repository.js';
import { requireAuth } from '../auth/requireAuth.js';
import { getPublishedCollectionBySlug, getPublishedCollections } from './service.js';

// Slugs are always lowercase-kebab-case by convention; anything else can't
// possibly match a row, so it's treated as not found rather than a separate
// 400 — one error shape for "this collection doesn't exist" either way.
const slugParamSchema = z.object({ slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) });

export const collectionsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async () => {
    return { collections: await getPublishedCollections() };
  });

  app.get('/comics/index', { preHandler: requireAuth }, async () => ({ collections: await listComicCollections() }));

  app.get('/:slug/comics', { preHandler: requireAuth }, async (request, reply) => {
    const params = slugParamSchema.safeParse(request.params);
    const query = z.object({ offset: z.coerce.number().int().min(0).max(2147483647).default(0) }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_request' });
    return listCollectionComics(params.data.slug, query.data.offset);
  });

  app.get('/:slug', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = slugParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const collection = await getPublishedCollectionBySlug(parsed.data.slug);
    if (!collection) {
      reply.code(404);
      return { error: 'not_found' };
    }

    return { collection };
  });
};
