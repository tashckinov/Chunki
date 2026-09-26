import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import {
  listGroupsForAdmin,
  createGroupForAdmin,
  updateGroupForAdmin,
  deleteGroupForAdmin,
  listChunksWithGroupsForAdmin,
  setChunkGroupsForAdmin,
  applyClassificationForAdmin,
} from './service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const chunkIdParamSchema = z.object({ chunkId: z.string().uuid() });

// A slug-like key (used to reference the group from the AI-classification
// JSON, which names groups by key rather than by not-yet-known DB id).
const KEY_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const groupBodySchema = z.object({
  key: z.string().min(1).max(100).regex(KEY_REGEX),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
});

const setChunkGroupsBodySchema = z.object({ groupIds: z.array(z.string().uuid()).max(50) });

const applyClassificationBodySchema = z.object({
  newGroups: z
    .array(z.object({ key: z.string().min(1).max(100).regex(KEY_REGEX), name: z.string().min(1).max(200), description: z.string().max(2000).nullable() }))
    .max(200),
  assignments: z.array(z.object({ chunkId: z.string().uuid(), groupKeys: z.array(z.string().min(1).max(100)).max(20) })).max(5000),
});

/** Admin-only "Типы" — CRUD for chunk_semantic_groups plus the AI-classification apply step (see lib/chunkGroupAiPrompt.ts / chunkGroupImport.ts on the frontend for the copy-prompt/paste-JSON half of that flow). */
export const chunkGroupsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/', async () => {
    return { groups: await listGroupsForAdmin() };
  });

  app.post('/', async (request, reply) => {
    const parsed = groupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await createGroupForAdmin(parsed.data);
    if (result.kind !== 'ok') {
      reply.code(409);
      return { error: 'duplicate_key' };
    }
    return { group: result.group };
  });

  app.patch('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = groupBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await updateGroupForAdmin(params.data.id, body.data);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (result.kind === 'duplicate_key') {
      reply.code(409);
      return { error: 'duplicate_key' };
    }
    return { group: result.group };
  });

  app.delete('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const removed = await deleteGroupForAdmin(params.data.id);
    if (!removed) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.get('/chunks', async () => {
    return { chunks: await listChunksWithGroupsForAdmin() };
  });

  app.patch('/chunks/:chunkId', async (request, reply) => {
    const params = chunkIdParamSchema.safeParse(request.params);
    const body = setChunkGroupsBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await setChunkGroupsForAdmin(params.data.chunkId, body.data.groupIds);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  app.post('/apply-classification', async (request, reply) => {
    const parsed = applyClassificationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await applyClassificationForAdmin(parsed.data);
    return result;
  });
};
