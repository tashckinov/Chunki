import { resetLearningProgress } from './resetProgress.js';
import { getDailyLearningPlan } from './dailyLearningPlan.js';
import { listLearningModules } from './learningModules.js';
import { listCurriculumTopics } from './topicCatalog.js';
import { topicStudySuggestion } from './topicStudySuggestions.js';
import { rateTopicStudy } from './topicStudyRating.js';
import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { chooseGrammarTest } from '../grammarTests/repository.js';
import { grammarTestIdSchema } from '../grammarTests/schema.js';
import { requireAuthenticatedSession } from '../auth/requireAuth.js';
import { getPlacementQuota, getPlacementResult, getProgramForUser, getTopicStudy, rebuildProgramFromLastTest, startIndependentTopic, startTopicAttempt, submitPlacementTest, submitTopicAttempt } from './service.js';

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
  variantId: grammarTestIdSchema.optional(),
  submissionId: z.string().uuid().optional(),
  fromLevel: z.enum(CEFR_LEVELS).nullable(),
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

const CATALOG_PREVIEW_IDS = {
  A1: ['a1-verb-to-be', 'a1-core-functions-greetings', 'a1-present-simple', 'a1-food-drink', 'a1-core-functions-directions'],
  A2: ['a2-articles', 'a2-requests', 'a2-past-continuous', 'a2-core-functions-suggestions', 'a2-core-vocabulary-travel-services'],
  B1: ['b1-present-perfect-past-simple', 'b1-opinions', 'b1-core-vocabulary-collocations', 'b1-core-functions-managing-interaction', 'b1-second-conditional'],
  B2: ['b2-mixed-conditionals', 'b2-core-functions-speculation', 'b2-core-vocabulary-colloquial', 'b2-core-functions-argument', 'b2-core-functions-reviews'],
  C1: ['c1-negative-inversion', 'c1-core-vocabulary-false-friends', 'c1-core-functions-hedged-opinions', 'c1-core-vocabulary-idioms', 'c1-core-functions-defending-views'],
} as const;

export const programRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return getProgramForUser(request.session!.userId);
  });

  app.post('/reset-progress', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const input = z.object({ confirmation: z.literal('Я УВЕРЕН') }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_confirmation' });
    await resetLearningProgress(request.session!.userId);
    return { ok: true };
  });

  app.post('/daily-plan', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const input = z.object({ timeZone: z.string().min(1).max(64).refine((value) => {
      try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_request' });
    reply.header('Cache-Control', 'no-store');
    return { plan: await getDailyLearningPlan(request.session!.userId, input.data.timeZone) };
  });

  app.post('/independent-topic', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const input = z.object({ curriculumId: z.string().min(1).max(72).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_request' });
    const result = await startIndependentTopic(request.session!.userId, input.data.curriculumId);
    if (result.kind === 'not_allowed') return reply.code(403).send({ error: result.kind });
    if (result.kind === 'not_found') return reply.code(404).send({ error: result.kind });
    return { topicId: result.topicId };
  });

  app.get('/modules', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { modules: await listLearningModules(request.session!.userId) };
  });

  app.get('/catalog', async () => ({
    topics: (await listCurriculumTopics()).map(({ id, title, level, objective }) => ({ id, title, level, objective })),
  }));

  app.get('/catalog-preview', async () => {
    const topics = await listCurriculumTopics();
    const byId = new Map(topics.map((topic) => [topic.id, topic]));
    const levels = Object.entries(CATALOG_PREVIEW_IDS).map(([level, ids]) => ({
      level,
      topics: ids.flatMap((id) => {
        const topic = byId.get(id);
        return topic && topic.level.replace('+', '') === level ? [{ id, title: topic.title }] : [];
      }),
    }));
    return { total: topics.length, levels };
  });

  app.get('/placement-results/:id', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const params = topicIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    const result = await getPlacementResult(request.session!.userId, params.data.id);
    return result ?? reply.code(404).send({ error: 'not_found' });
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

  app.route({
    method: ['GET', 'PATCH'],
    url: '/topics/:id/study-rating',
    preHandler: requireAuthenticatedSession,
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = topicIdParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
      const body = z.object({ rating: z.enum(['clear', 'unclear']) }).optional().safeParse(request.body);
      if (request.method === 'PATCH' && (!body.success || !body.data)) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const rating = await rateTopicStudy(request.session!.userId, params.data.id,
        request.method === 'PATCH' && body.success ? body.data?.rating : undefined);
      return rating === undefined ? reply.code(404).send({ error: 'not_found' }) : { rating };
    },
  });

  app.route({
    method: ['GET', 'PATCH'],
    url: '/topics/:id/study-suggestion',
    preHandler: requireAuthenticatedSession,
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = topicIdParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
      const body = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(request.body);
      if (request.method === 'PATCH' && !body.success) return reply.code(400).send({ error: 'invalid_request' });
      const message = await topicStudySuggestion(request.session!.userId, params.data.id,
        request.method === 'PATCH' && body.success ? body.data.message : undefined);
      return message === undefined ? reply.code(404).send({ error: 'not_found' }) : { message };
    },
  });

  // Apply route-specific limits to requests that can trigger generation.
  await app.register(rateLimit, { global: false });

  app.get('/placement-variant', { preHandler: requireAuthenticatedSession }, async (request, reply) => {
    const query = z.object({ previous: grammarTestIdSchema.optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    reply.header('Cache-Control', 'no-store');
    const quota = await getPlacementQuota(request.session!.userId);
    if (!quota.allowed) return reply.code(403).send({ error: 'not_allowed' });
    if (quota.limit !== null && quota.used >= quota.limit) return reply.code(429).send({ error: 'placement_limit_reached', quota });
    const previous = query.data.previous === 'builtin' ? undefined : query.data.previous;
    return chooseGrammarTest(previous);
  });

  app.post('/rebuild', {
    preHandler: [requireAuthenticatedSession, app.rateLimit({ max: 5, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId })],
  }, async (request, reply) => {
    try {
      const status = await rebuildProgramFromLastTest(request.session!.userId);
      if (status === 'not_allowed') return reply.code(403).send({ error: 'not_allowed' });
      return reply.code(status === 'building' ? 202 : 200).send({ status });
    } catch (err) {
      request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'rebuildProgramFromLastTest failed');
      return reply.code(502).send({ error: 'generation_failed' });
    }
  });

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
      if (result.kind === 'limit_reached') return reply.code(429).send({ error: 'placement_limit_reached', quota: result.quota });
      if (result.kind === 'already_checking') return reply.code(409).send({ error: 'placement_already_checking' });
      if (result.kind === 'variant_not_found') return reply.code(404).send({ error: 'variant_not_found' });
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
      if (result.kind === 'already_mastered' || result.kind === 'not_due' || result.kind === 'generation_in_progress') {
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
