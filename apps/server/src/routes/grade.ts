import type { FastifyPluginAsync } from 'fastify';
import { getGradingProvider } from '../grading/index.js';
import { exercisesSubmissionSchema, placementTestSubmissionSchema } from '../schemas.js';

export const gradeRoutes: FastifyPluginAsync = async (app) => {
  app.post('/placement-test', async (request, reply) => {
    const parsed = placementTestSubmissionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    try {
      return await getGradingProvider().gradePlacementTest(parsed.data);
    } catch (err) {
      request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'gradePlacementTest failed');
      reply.code(502);
      return { error: 'grading_failed', message: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/exercises', async (request, reply) => {
    const parsed = exercisesSubmissionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    try {
      return await getGradingProvider().gradeExercises(parsed.data);
    } catch (err) {
      request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'gradeExercises failed');
      reply.code(502);
      return { error: 'grading_failed', message: err instanceof Error ? err.message : String(err) };
    }
  });
};
