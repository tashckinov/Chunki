import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import { UPLOADS_DIR } from '../../config/uploads.js';
import {
  listUsers,
  setUserPremiumUntil,
  resetProductionChecks,
  listCollectionsAdmin,
  createCollection,
  updateCollection,
  listChunksForCollectionAdmin,
  createChunkInCollection,
  updateChunk,
  deleteChunk,
  removeChunkFromCollection,
  listAiCallLogsForAdmin,
  getDialogueForChunk,
  saveDialogueForChunk,
  deleteDialogueForChunk,
} from './service.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Collection banners: ~800x600 (4:3), shown in the Cards library. Resized
// server-side (see the upload route below) so an unedited phone photo
// doesn't get stored — and served — at full size for a small card image.
const MAX_BANNER_BYTES = 10 * 1024 * 1024; // raw upload cap, before resizing
const BANNER_MAX_DIMENSION = 1600; // ~2x an 800x600 display size, comfortable for retina

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
  bannerUrl: z.string().nullable().optional(),
});
const collectionPatchSchema = z.object({
  slug: z.string().min(1).max(200).regex(SLUG_REGEX).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  level: z.enum(LEVELS).optional(),
  position: z.number().int().optional(),
  isPublished: z.boolean().optional(),
  bannerUrl: z.string().nullable().optional(),
});

const chunkSentencePartSchema = z.object({
  text: z.string().min(1),
  explanationRu: z.string().min(1),
  explanationEn: z.string().min(1),
});
const chunkSentenceSchema = z.object({
  text: z.string().min(1),
  translation: z.string().min(1),
  parts: z.array(chunkSentencePartSchema).min(1),
});

const chunkCreateSchema = z.object({
  text: z.string().min(1),
  translation: z.string().min(1),
  explanation: z.string().nullable().optional(),
  level: z.enum(LEVELS),
  // No .default([]) here (situationPrompts and sentences alike):
  // chunkPatchSchema (below) wraps this in .partial(), and a default can
  // still apply to an omitted key even when the field is optional — which
  // would silently wipe an unpatched chunk's prompts/sentences on every
  // unrelated edit. "Omitted on create" is instead handled explicitly in
  // the POST handler below.
  situationPrompts: z.array(z.string().min(1)).optional(),
  sentences: z.array(chunkSentenceSchema).optional(),
});
const chunkPatchSchema = chunkCreateSchema.partial();

const dialogueSaveSchema = z.object({
  participants: z.array(z.object({ characterId: z.string().uuid(), side: z.enum(['left', 'right']) })).min(1),
  messages: z.array(z.object({ characterId: z.string().uuid(), characterImageId: z.string().uuid(), text: z.string().min(1) })).min(1),
});

/**
 * Every route here is admin-only, unlike the other modules (which mix
 * public/gated routes) — a plugin-wide preHandler hook is clearer than
 * repeating { preHandler: requireAdmin } on each of the ten routes below.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  await app.register(multipart, { limits: { fileSize: MAX_BANNER_BYTES, files: 1 } });

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

  app.post('/users/:id/reset-production-checks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await resetProductionChecks(params.data.id);
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
    const collection = await createCollection({ ...body.data, description: body.data.description ?? null, bannerUrl: body.data.bannerUrl ?? null });
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

  app.post('/uploads/banner', async (request, reply) => {
    const file = await request.file();
    if (!file || !file.mimetype.startsWith('image/')) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    let original: Buffer;
    try {
      original = await file.toBuffer();
    } catch (err) {
      // @fastify/multipart throws FST_REQ_FILE_TOO_LARGE once the stream
      // exceeds the configured fileSize limit — surface that as a normal
      // 400 instead of a generic failure.
      if (err instanceof Error && 'code' in err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
        reply.code(400);
        return { error: 'file_too_large' };
      }
      throw err;
    }

    let resized: Buffer;
    try {
      resized = await sharp(original)
        .resize({ width: BANNER_MAX_DIMENSION, height: BANNER_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      reply.code(400);
      return { error: 'invalid_file_type' };
    }

    const filename = `${randomUUID()}.jpg`;
    const bannersDir = path.join(UPLOADS_DIR, 'banners');
    await fs.promises.mkdir(bannersDir, { recursive: true });
    await fs.promises.writeFile(path.join(bannersDir, filename), resized);

    return { url: `/uploads/banners/${filename}` };
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
      level: body.data.level,
      situationPrompts: body.data.situationPrompts ?? [],
      sentences: body.data.sentences ?? [],
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

  app.get('/chunks/:id/dialogue', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { dialogue: await getDialogueForChunk(params.data.id) };
  });

  // Save/upsert — a chunk has at most one dialogue, so a repeat POST
  // replaces its participants+messages rather than creating a second one.
  app.post('/chunks/:id/dialogue', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = dialogueSaveSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await saveDialogueForChunk(params.data.id, body.data);
    if (result.kind === 'invalid_reference') {
      reply.code(400);
      return { error: 'invalid_reference' };
    }
    return { dialogue: result.dialogue };
  });

  app.delete('/chunks/:id/dialogue', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const deleted = await deleteDialogueForChunk(params.data.id);
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
