import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import {
  listUsers,
  setUserPremiumUntil,
  listCollectionsAdmin,
  createCollection,
  updateCollection,
  listChunksForCollectionAdmin,
  createChunkInCollection,
  updateChunk,
  deleteChunk,
  removeChunkFromCollection,
  listAiCallLogsForAdmin,
} from './service.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const idParamSchema = z.object({ id: z.string().uuid() });
const collectionChunkParamSchema = z.object({ id: z.string().uuid(), chunkId: z.string().uuid() });
const aiLogsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

const premiumBodySchema = z.object({ premiumUntil: z.string().datetime().nullable() });

const collectionCreateSchema = z.object({
  slug: z.string().min(1).max(200).regex(SLUG_REGEX),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  level: z.enum(LEVELS),
  position: z.number().int().default(0),
  isPublished: z.boolean().default(false),
});
const collectionPatchSchema = z.object({
  slug: z.string().min(1).max(200).regex(SLUG_REGEX).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  level: z.enum(LEVELS).optional(),
  position: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

const chunkCreateSchema = z.object({
  text: z.string().min(1),
  translation: z.string().min(1),
  explanation: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
  exampleTranslation: z.string().nullable().optional(),
  level: z.enum(LEVELS),
  situationPrompt: z.string().nullable().optional(),
});
const chunkPatchSchema = chunkCreateSchema.partial();

/**
 * Every route here is admin-only, unlike the other modules (which mix
 * public/gated routes) — a plugin-wide preHandler hook is clearer than
 * repeating { preHandler: requireAdmin } on each of the ten routes below.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/users', async () => ({ users: await listUsers() }));

  app.patch('/users/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = premiumBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await setUserPremiumUntil(params.data.id, body.data.premiumUntil ? new Date(body.data.premiumUntil) : null);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { user: result.user };
  });

  app.get('/collections', async () => ({ collections: await listCollectionsAdmin() }));

  app.post('/collections', async (request, reply) => {
    const body = collectionCreateSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const collection = await createCollection({ ...body.data, description: body.data.description ?? null });
    reply.code(201);
    return { collection };
  });

  app.patch('/collections/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = collectionPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await updateCollection(params.data.id, body.data);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { collection: result.collection };
  });

  app.get('/collections/:id/chunks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { chunks: await listChunksForCollectionAdmin(params.data.id) };
  });

  app.post('/collections/:id/chunks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = chunkCreateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const chunk = await createChunkInCollection(params.data.id, {
      text: body.data.text,
      translation: body.data.translation,
      explanation: body.data.explanation ?? null,
      example: body.data.example ?? null,
      exampleTranslation: body.data.exampleTranslation ?? null,
      level: body.data.level,
      situationPrompt: body.data.situationPrompt ?? null,
    });
    reply.code(201);
    return { chunk };
  });

  app.patch('/chunks/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = chunkPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await updateChunk(params.data.id, body.data);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { chunk: result.chunk };
  });

  app.delete('/chunks/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const deleted = await deleteChunk(params.data.id);
    if (!deleted) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.delete('/collections/:id/chunks/:chunkId', async (request, reply) => {
    const params = collectionChunkParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const removed = await removeChunkFromCollection(params.data.id, params.data.chunkId);
    if (!removed) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.get('/ai-logs', async (request, reply) => {
    const parsed = aiLogsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    return { logs: await listAiCallLogsForAdmin(parsed.data.limit) };
  });
};
