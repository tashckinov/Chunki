import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { requireAuthenticatedSession } from '../auth/requireAuth.js';
import { getProgramForUser, getTopicStudy, startTopicAttempt, submitPlacementTest, submitTopicAttempt } from './service.js';

const CEFR_LEVELS = ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] as const;

// Bounds both the key/value size AND the total entry count — a plain
// `z.record(z.string(), z.string())` caps neither, and this record's
// contents flow straight into an LLM grading call and into JSONB storage
// (placement_tests.mcq_answers / topic_attempts.answers).
const boundedRecord = (maxEntries: number, maxValueLength: number) =>
  z
    .record(z.string().max(20), z.string().max(maxValueLength))
    .refine((obj) => Object.keys(obj).length <= maxEntries, { message: `at most ${maxEntries} entries allowed` });

const placementTestBodySchema = z.object({
  fromLevel: z.enum(CEFR_LEVELS),
  toLevel: z.enum(CEFR_LEVELS),
  purpose: z.array(z.string().max(100)).max(10),
  mcqAnswers: boundedRecord(20, 20),
  open9: z.string().max(4000),
  open10: z.string().max(4000),
  essay: z.string().max(8000),
});

const topicIdParamSchema = z.object({ id: z.string().uuid() });
const attemptParamSchema = z.object({ id: z.string().uuid(), attemptId: z.string().uuid() });
const attemptSubmitBodySchema = z.object({ answers: boundedRecord(20, 2000) });

export const programRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuthenticatedSession }, async (request) => {
    return getProgramForUser(request.session!.userId);
  });

  app.get('/topics/:id/study', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const params = topicIdParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    let result;
    try {
      result = await getTopicStudy(request.session!.userId, params.data.id);
    } catch (err) {
      request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'generateTopicStudy failed');
      reply.code(502);
      return { error: 'generation_failed' };
    }
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (result.kind === 'not_allowed') {
      reply.code(403);
      return { error: 'not_allowed', upsellTariffs: result.upsellTariffs };
    }
    return { study: result.study };
  });

  // Rate-limited, unlike the plain GET routes above — every route below this
  // point makes at least one LLM call, so it's scoped separately rather than
  // applied to the whole plugin (mirrors progress/routes.ts's production-check route).
  await app.register(rateLimit, { global: false });

  app.post(
    '/placement-test',
    {
      preHandler: [requireAuthenticatedSession, app.rateLimit({ max: 5, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId })],
    },
    async (request, reply) => {
      const parsed = placementTestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request', details: parsed.error.flatten() };
      }

      let result;
      try {
        result = await submitPlacementTest(request.session!.userId, parsed.data);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'gradePlacementTest failed');
        reply.code(502);
        return { error: 'grading_failed' };
      }
      if (result.kind === 'not_allowed') {
        reply.code(403);
        return { error: 'not_allowed', upsellTariffs: result.upsellTariffs };
      }
      return { result: result.result, topics: result.topics };
    },
  );

  app.post(
    '/topics/:id/attempts',
    {
      preHandler: [requireAuthenticatedSession, app.rateLimit({ max: 20, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId })],
    },
    async (request, reply) => {
      const params = topicIdParamSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      let result;
      try {
        result = await startTopicAttempt(request.session!.userId, params.data.id);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'generateTopicExercises failed');
        reply.code(502);
        return { error: 'generation_failed' };
      }
      if (result.kind === 'not_found') {
        reply.code(404);
        return { error: 'not_found' };
      }
      if (result.kind === 'already_mastered' || result.kind === 'not_due') {
        reply.code(409);
        return { error: result.kind };
      }
      if (result.kind === 'not_allowed') {
        reply.code(403);
        return { error: 'not_allowed', upsellTariffs: result.upsellTariffs };
      }
      return { attemptId: result.attemptId, attemptKind: result.attemptKind, items: result.items };
    },
  );

  app.post(
    '/topics/:id/attempts/:attemptId/submit',
    {
      preHandler: [requireAuthenticatedSession, app.rateLimit({ max: 20, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId })],
    },
    async (request, reply) => {
      const params = attemptParamSchema.safeParse(request.params);
      const body = attemptSubmitBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      let result;
      try {
        result = await submitTopicAttempt(request.session!.userId, params.data.id, params.data.attemptId, body.data.answers);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'gradeExercises failed');
        reply.code(502);
        return { error: 'grading_failed' };
      }
      if (result.kind === 'not_found' || result.kind === 'attempt_not_found') {
        reply.code(404);
        return { error: 'not_found' };
      }
      if (result.kind === 'already_graded') {
        reply.code(409);
        return { error: 'already_graded' };
      }
      if (result.kind === 'not_allowed') {
        reply.code(403);
        return { error: 'not_allowed', upsellTariffs: result.upsellTariffs };
      }
      return { result: result.result, newTopicsAdded: result.newTopicsAdded };
    },
  );
};
