import { randomUUID } from 'node:crypto';
import { MockGradingProvider, type PlacementTestSubmission } from '@app/shared';
import { afterAll, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { getGradingProvider } from '../grading/index.js';
import { getPlacementResult, getProgramForUser, submitPlacementTest } from '../modules/program/service.js';

vi.mock('../grading/index.js', () => {
  const provider = new MockGradingProvider();
  return { getGradingProvider: () => provider };
});

afterAll(() => pool.end());

it('counts successful tests once, serializes concurrent checks and keeps results available after rollover', async () => {
  const tariff = await pool.query<{ id: string }>(
    "INSERT INTO subscription_tariffs (name, periodicity, monthly_placement_limit) VALUES ('Placement test fixture', 'monthly', 1) RETURNING id",
  );
  const tariffId = tariff.rows[0].id;
  const users = await pool.query<{ id: string }>(
    "INSERT INTO users (premium_until, current_tariff_id) VALUES (now() + interval '1 day', $1), (null, null) RETURNING id",
    [tariffId],
  );
  const [learner, other] = users.rows;
  const id = randomUUID();
  const submission: PlacementTestSubmission = {
    submissionId: id, variantId: 'builtin', fromLevel: null, toLevel: 'B2', purpose: [],
    mcqAnswers: { 1: '—' }, open9: '', open10: '', essay: '',
  };
  const provider = getGradingProvider();
  const grade = provider.gradePlacementTest.bind(provider);
  const gradeSpy = vi.spyOn(provider, 'gradePlacementTest');
  try {
    gradeSpy.mockRejectedValueOnce(new Error('Test provider unavailable'));
    await expect(submitPlacementTest(learner.id, submission)).rejects.toThrow('Test provider unavailable');
    expect((await getProgramForUser(learner.id)).placement.quota.used).toBe(0);

    let markStarted!: () => void;
    let finishGrading!: () => void;
    const gradingStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    const gradingReleased = new Promise<void>((resolve) => { finishGrading = resolve; });
    gradeSpy.mockImplementationOnce(async (input, definition) => {
      markStarted();
      await gradingReleased;
      return grade(input, definition);
    });
    const firstCheck = submitPlacementTest(learner.id, submission);
    try {
      await Promise.race([gradingStarted, firstCheck]);
      expect((await submitPlacementTest(learner.id, { ...submission, submissionId: randomUUID() })).kind).toBe('already_checking');
    } finally {
      finishGrading();
      await firstCheck;
    }

    expect((await firstCheck).kind).toBe('ok');
    expect((await submitPlacementTest(learner.id, submission)).kind).toBe('ok');
    expect((await submitPlacementTest(learner.id, { ...submission, submissionId: randomUUID() })).kind).toBe('limit_reached');
    expect(gradeSpy).toHaveBeenCalledTimes(2);
    expect(await getPlacementResult(other.id, id)).toBeNull();
    expect((await getPlacementResult(learner.id, id))?.result.review?.[0]).toMatchObject({ key: '1', answer: '', correction: expect.any(String) });

    const { placement } = await getProgramForUser(learner.id);
    expect(placement.quota.used).toBe(1);
    await pool.query(
      "UPDATE placement_tests SET created_at = $2::timestamptz - interval '1 month 1 day' WHERE id = $1",
      [id, placement.quota.resetsAt],
    );
    const afterRollover = (await getProgramForUser(learner.id)).placement;
    expect(afterRollover.quota.used).toBe(0);
    expect(afterRollover.history[0].id).toBe(id);
  } finally {
    gradeSpy.mockRestore();
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[learner.id, other.id]]);
    await pool.query('DELETE FROM subscription_tariffs WHERE id = $1', [tariffId]);
  }
});
