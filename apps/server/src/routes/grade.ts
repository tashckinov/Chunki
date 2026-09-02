import { Router } from 'express';
import { getGradingProvider } from '../grading/index.js';
import { exercisesSubmissionSchema, placementTestSubmissionSchema } from '../schemas.js';

export const gradeRouter = Router();

gradeRouter.post('/placement-test', async (req, res) => {
  const parsed = placementTestSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await getGradingProvider().gradePlacementTest(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('gradePlacementTest failed', err);
    res.status(502).json({ error: 'grading_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

gradeRouter.post('/exercises', async (req, res) => {
  const parsed = exercisesSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await getGradingProvider().gradeExercises(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('gradeExercises failed', err);
    res.status(502).json({ error: 'grading_failed', message: err instanceof Error ? err.message : String(err) });
  }
});
