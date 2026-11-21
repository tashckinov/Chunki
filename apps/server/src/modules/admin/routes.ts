import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { CEFR_LEVELS, CURRICULUM_CATEGORIES, TOPIC_CATEGORIES } from '@app/shared';
import { createCurriculumTopic, getTopicForReview, linkCurriculumTopic, listCurriculumTopics, listTopicsForReview, updateTopicForReview } from '../program/topicCatalog.js';
import { listProductionModelStats } from '../aiLogs/repository.js';
import { createTimecode, listTimecodes } from '../timecodes/service.js';
import { requireAdmin } from '../auth/requireAuth.js';
import { MAX_UPLOAD_BYTES, UPLOADS_DIR, resizeImage } from '../../config/uploads.js';
import {
  listUsers,
  setUserPremiumUntil,
  resetDailyChecksForAdmin,
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
  listPaymentsForAdmin,
  listProgramTopicsForAdmin,
} from './service.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Collection banners: ~800x600 (4:3), shown in the Cards library. Resized
// server-side (see the upload route below) so an unedited phone photo
// doesn't get stored — and served — at full size for a small card image.
const BANNER_MAX_DIMENSION = 1600; // ~2x an 800x600 display size, comfortable for retina

// A malformed id (not a UUID at all) is always 400/invalid_request in this
// admin-only module — unlike the public chunks/collections module, which
// deliberately 404s on both a malformed id and a real-but-unknown one so a
// caller can't distinguish "wrong format" from "doesn't exist." There's no
// such concern for an authenticated admin, so this file lets 400 mean
// "your request was malformed" and reserves 404 for "well-formed id, no
// such row" everywhere below.
const idParamSchema = z.object({ id: z.string().uuid() });
const collectionChunkParamSchema = z.object({ id: z.string().uuid(), chunkId: z.string().uuid() });
const aiLogsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const paymentsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const programTopicsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

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

const situationPromptPartSchema = z.object({
  text: z.string().min(1),
  explanationRu: z.string().min(1),
  explanationEn: z.string().min(1),
});
const situationPromptSchema = z.object({
  text: z.string().min(1),
  parts: z.array(situationPromptPartSchema).max(20),
  expectedGroupId: z.string().uuid().nullable(),
});

const chunkSentencePartSchema = z.object({
  text: z.string().min(1),
  explanationRu: z.string().min(1),
  explanationEn: z.string().min(1),
});
const chunkSentenceSchema = z.object({
  text: z.string().min(1),
  translation: z.string().min(1),
  parts: z.array(chunkSentencePartSchema).min(1).max(20),
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
  situationPrompts: z.array(situationPromptSchema).max(50).optional(),
  sentences: z.array(chunkSentenceSchema).max(50).optional(),
});
const chunkPatchSchema = chunkCreateSchema.partial();

const dialogueKindParamSchema = idParamSchema.extend({ kind: z.enum(['browse', 'situation']) });

const dialogueSaveSchema = z
  .object({
    participants: z.array(z.object({ characterId: z.string().uuid(), side: z.enum(['left', 'right']) })).min(1),
    messages: z.array(z.object({ characterId: z.string().uuid(), characterImageId: z.string().uuid(), text: z.string().min(1), isBlank: z.boolean().optional() })).min(1),
    // Only meaningful for kind='situation' — see chunk_dialogues.expected_group_id.
    expectedGroupId: z.string().uuid().nullable().optional(),
  })
  // Mirrors dialogues/repository.ts's referencesAreValid: at most one blank, and only as the last message.
  .refine((v) => {
    const blanks = v.messages.filter((m) => m.isBlank).length;
    return blanks <= 1 && (blanks === 0 || v.messages[v.messages.length - 1].isBlank);
  }, 'at most one message may be isBlank, and it must be the last message');

/**
 * Every route here is admin-only, unlike the other modules (which mix
 * public/gated routes) — a plugin-wide preHandler hook is clearer than
 * repeating { preHandler: requireAdmin } on each of the ten routes below.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

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

  app.post('/users/:id/reset-daily-checks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await resetDailyChecksForAdmin(params.data.id);
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

    let resized: { buffer: Buffer; extension: 'png' | 'jpg' };
    try {
      resized = await resizeImage(original, BANNER_MAX_DIMENSION);
    } catch {
      reply.code(400);
      return { error: 'invalid_file_type' };
    }

    const filename = `${randomUUID()}.${resized.extension}`;
    const bannersDir = path.join(UPLOADS_DIR, 'banners');
    await fs.promises.mkdir(bannersDir, { recursive: true });
    await fs.promises.writeFile(path.join(bannersDir, filename), resized.buffer);

    return { url: `/uploads/banners/${filename}` };
  });

  app.get('/collections/:id/chunks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
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
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const deleted = await deleteChunk(params.data.id);
    if (!deleted) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.get('/chunks/:id/dialogue/:kind', async (request, reply) => {
    const params = dialogueKindParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    return { dialogue: await getDialogueForChunk(params.data.id, params.data.kind) };
  });

  // Save/upsert — a chunk has at most one dialogue per kind, so a repeat POST
  // for the same kind replaces its participants+messages rather than creating a second one.
  app.post('/chunks/:id/dialogue/:kind', async (request, reply) => {
    const params = dialogueKindParamSchema.safeParse(request.params);
    const body = dialogueSaveSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await saveDialogueForChunk(params.data.id, params.data.kind, body.data);
    if (result.kind === 'invalid_reference') {
      reply.code(400);
      return { error: 'invalid_reference' };
    }
    return { dialogue: result.dialogue };
  });

  app.delete('/chunks/:id/dialogue/:kind', async (request, reply) => {
    const params = dialogueKindParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const deleted = await deleteDialogueForChunk(params.data.id, params.data.kind);
    if (!deleted) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.delete('/collections/:id/chunks/:chunkId', async (request, reply) => {
    const params = collectionChunkParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const removed = await removeChunkFromCollection(params.data.id, params.data.chunkId);
    if (!removed) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.get('/production-model-stats', async () => ({ models: await listProductionModelStats() }));

  app.get('/ai-logs', async (request, reply) => {
    const parsed = aiLogsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    return { logs: await listAiCallLogsForAdmin(parsed.data.limit) };
  });

  app.get('/timecodes', async () => ({ timecodes: await listTimecodes() }));

  app.post('/timecodes', async (request, reply) => {
    const parsed = z.object({
      tariffId: z.string().uuid(),
      months: z.number().int().min(1).max(120),
      maxUses: z.number().int().min(1).max(10000),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const { tariffId, months, maxUses } = parsed.data;
    const timecode = await createTimecode(tariffId, months, maxUses);
    if (!timecode) return reply.code(404).send({ error: 'tariff_not_found' });
    return reply.code(201).send({ timecode });
  });

  app.get('/payments', async (request, reply) => {
    const parsed = paymentsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    return { payments: await listPaymentsForAdmin(parsed.data.limit) };
  });

  const curriculumIdSchema = z.string().min(1).max(72).regex(SLUG_REGEX);
  app.get('/curriculum-topics', async () => ({ topics: await listCurriculumTopics() }));
  app.post('/curriculum-topics', async (request, reply) => {
    const parsed = z.object({
      id: curriculumIdSchema,
      title: z.string().trim().min(1).max(160),
      level: z.enum(CEFR_LEVELS),
      category: z.enum(CURRICULUM_CATEGORIES),
      objective: z.string().trim().min(1).max(800),
      subtopics: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    if (!await createCurriculumTopic(parsed.data)) return reply.code(409).send({ error: 'duplicate_curriculum_topic' });
    return reply.code(201).send({ topic: parsed.data });
  });

  app.get('/topic-catalog', async (request, reply) => {
    const query = z.object({
      q: z.string().trim().max(160).default(''),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return listTopicsForReview(query.data.q, query.data.offset);
  });

  const catalogTopicParams = z.object({ key: z.string().min(1).max(100).regex(SLUG_REGEX) });
  app.get('/topic-catalog/:key', async (request, reply) => {
    const params = catalogTopicParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    const topic = await getTopicForReview(params.data.key);
    return topic ? { topic } : reply.code(404).send({ error: 'not_found' });
  });

  app.patch('/topic-catalog/:key/curriculum', async (request, reply) => {
    const params = catalogTopicParams.safeParse(request.params);
    const body = z.object({ curriculumId: curriculumIdSchema.nullable() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    if (!await linkCurriculumTopic(params.data.key, body.data.curriculumId)) {
      return reply.code(409).send({ error: 'curriculum_link_unavailable' });
    }
    return { ok: true };
  });

  app.patch('/topic-catalog/:key', async (request, reply) => {
    const params = catalogTopicParams.safeParse(request.params);
    const body = z.object({
      title: z.string().trim().min(1).max(160),
      category: z.enum(TOPIC_CATEGORIES),
      level: z.enum(CEFR_LEVELS).nullable(),
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    const result = await updateTopicForReview({ key: params.data.key, ...body.data });
    if (result.kind === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (result.kind === 'duplicate') return reply.code(409).send({ error: 'duplicate_topic' });
    if (result.kind === 'fixed') return reply.code(409).send({ error: 'fixed_curriculum' });
    return { topic: result.topic };
  });

  app.get('/program-topics', async (request, reply) => {
    const parsed = programTopicsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    return { topics: await listProgramTopicsForAdmin(parsed.data.limit) };
  });
};
