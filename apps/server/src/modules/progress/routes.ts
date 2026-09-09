import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { requireAuthenticatedSession } from '../auth/requireAuth.js';
import {
  recordSort,
  getProgressForChunks,
  buildRecognitionCheck,
  recordRecognitionResult,
  buildProductionCheck,
  submitProductionAnswer,
  type SortVerdict,
} from './service.js';

const chunkIdParamSchema = z.object({ chunkId: z.string().uuid() });
const sortBodySchema = z.object({ chunkId: z.string().uuid(), verdict: z.enum(['know', 'dont', 'bury']) });
const optionSchema = z.object({ id: z.string(), label: z.string() });
const recognitionSubmitSchema = z.object({ selectedOptionId: z.string(), options: z.array(optionSchema) });
const productionSubmitSchema = z.object({ answer: z.string() });
const listQuerySchema = z.object({ chunkIds: z.string().min(1) });

export const progressRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sort', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const parsed = sortBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const progress = await recordSort(request.session!.userId, parsed.data.chunkId, parsed.data.verdict as SortVerdict);
    return { progress };
  });

  app.get('/recognition-check/:chunkId', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const parsed = chunkIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const result = await buildRecognitionCheck(request.session!.userId, parsed.data.chunkId);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (result.kind === 'wrong_state') {
      reply.code(409);
      return { error: 'wrong_state' };
    }
    return { chunkId: result.chunkId, prompt: result.prompt, options: result.options };
  });

  app.post('/recognition-check/:chunkId', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const params = chunkIdParamSchema.safeParse(request.params);
    const body = recognitionSubmitSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await recordRecognitionResult(request.session!.userId, params.data.chunkId, body.data.selectedOptionId, body.data.options);
    if (result.kind === 'options_mismatch') {
      reply.code(400);
      return { error: 'options_mismatch' };
    }
    return { correct: result.correct, progress: result.progress };
  });

  app.get('/production-check/:chunkId', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const parsed = chunkIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const result = await buildProductionCheck(request.session!.userId, parsed.data.chunkId);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (result.kind === 'wrong_state') {
      reply.code(409);
      return { error: 'wrong_state' };
    }
    if (result.kind === 'unavailable') {
      return { available: false };
    }
    return { available: true, chunkId: result.chunkId, situationPrompt: result.situationPrompt, chunkText: result.chunkText, chunkTranslation: result.chunkTranslation };
  });

  // Rate-limited, unlike every other route in this module — this is the one
  // that costs real money per call (an LLM judge call), so it's scoped
  // separately rather than applied to the whole plugin.
  await app.register(rateLimit, { global: false });

  app.post(
    '/production-check/:chunkId',
    {
      preHandler: [
        requireAuthenticatedSession,
        app.rateLimit({
          max: 20,
          timeWindow: '10 minutes',
          keyGenerator: (request) => request.session!.userId,
        }),
      ],
    },
    async (request, reply) => {
      const params = chunkIdParamSchema.safeParse(request.params);
      const body = productionSubmitSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      let result;
      try {
        result = await submitProductionAnswer(request.session!.userId, params.data.chunkId, body.data.answer);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'production check judge failed');
        reply.code(502);
        return { error: 'judge_unavailable' };
      }

      if (result.kind === 'not_found') {
        reply.code(404);
        return { error: 'not_found' };
      }
      if (result.kind === 'wrong_state') {
        reply.code(409);
        return { error: 'wrong_state' };
      }
      if (result.kind === 'unavailable') {
        reply.code(409);
        return { error: 'unavailable' };
      }
      return { verdict: result.verdict, feedback: result.feedback, progress: result.progress };
    },
  );

  app.get('/', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const chunkIds = parsed.data.chunkIds.split(',').filter(Boolean);
    const progress = await getProgressForChunks(request.session!.userId, chunkIds);
    return { progress };
  });
};
