import { randomUUID } from 'node:crypto';
import { MockGradingProvider, type PlacementTestSubmission, type CurriculumTopic } from '@app/shared';
import { afterAll, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { createCurriculumTopic, linkCurriculumTopic } from '../modules/program/topicCatalog.js';
import { getGradingProvider } from '../grading/index.js';
import { getPlacementResult, getProgramForUser, getTopicStudy, startTopicAttempt, submitPlacementTest, submitTopicAttempt } from '../modules/program/service.js';

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

it('assigns only fixed curriculum IDs, preserves legacy progress, and generates scoped lessons', async () => {
  const { rows: [learner, other] } = await pool.query<{ id: string }>(
    'INSERT INTO users (is_admin) VALUES (true), (true) RETURNING id',
  );
  const suffix = randomUUID();
  const legacyKey = `old-${suffix}`;
  const extension: CurriculumTopic = {
    id: `requests-${suffix}`, title: `Вежливые просьбы ${suffix}`, level: 'B1', category: 'Functions',
    objective: 'Попросить коллегу перенести встречу.', subtopics: ['Просьба', 'Ответ'],
  };
  expect(await createCurriculumTopic(extension)).toBe(true);
  const study = { explanation: 'Существующий урок', keyPoints: [], contrastExamples: [], exampleChunks: [] };
  await pool.query(
    "INSERT INTO program_topics (key, title, category, level, study_content) VALUES ($1, $2, 'Грамматика', 'A2', $3)",
    [legacyKey, `Старые артикли ${suffix}`, study],
  );
  const { rows: [legacy] } = await pool.query<{ id: string }>(
    `INSERT INTO user_topics (user_id, catalog_key, key, title, category, rationale, source, status)
     VALUES ($1, $2, $2, 'Старые артикли', 'Грамматика', 'Старое пояснение', 'placement', 'mastered') RETURNING id`,
    [learner.id, legacyKey],
  );
  expect(await linkCurriculumTopic(legacyKey, 'a2-articles')).toBe(true);

  const candidates = ['a2-articles', 'c1-negative-inversion', 'a1-verb-to-be', 'invented-topic', extension.id, extension.id]
    .map((key) => ({ key, rationale: 'Проверяемая рекомендация' }));
  const input: PlacementTestSubmission = { fromLevel: 'A2', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' };
  const provider = getGradingProvider();
  const grade = await provider.gradePlacementTest(input);
  const placement = vi.spyOn(provider, 'gradePlacementTest').mockResolvedValue({ ...grade, overallLevel: 'A2', topics: candidates });
  const grades = vi.spyOn(provider, 'gradeExercises').mockResolvedValue({
    scoreOutOf10: 10, passed: true, verdictLabel: 'Отлично', notes: [],
    discoveredTopics: candidates, nextReviewInDays: 0,
  });
  const lesson = vi.spyOn(provider, 'generateTopicStudy');
  const exercises = vi.spyOn(provider, 'generateTopicExercises');

  try {
    const first = await submitPlacementTest(learner.id, input);
    if (first.kind !== 'ok') throw new Error(first.kind);
    expect(first.topics).toHaveLength(2);
    expect(first.topics).toContainEqual(expect.objectContaining({ id: legacy.id, key: legacyKey, status: 'mastered', curriculumId: 'a2-articles' }));
    expect(first.result.topics).toEqual([expect.objectContaining({ title: extension.title, level: 'B1', category: 'Использование языка' })]);
    expect(placement.mock.lastCall?.[2]?.catalog).toContainEqual(expect.objectContaining({ id: extension.id, objective: extension.objective }));
    expect(placement.mock.lastCall?.[2]?.assignedKeys).toContain('a2-articles');
    expect(await getTopicStudy(learner.id, legacy.id)).toEqual({ kind: 'ok', study });
    expect(lesson).not.toHaveBeenCalled();

    const assigned = first.topics.find(({ curriculumId }) => curriculumId === extension.id)!;
    const attempt = await startTopicAttempt(learner.id, assigned.id);
    if (attempt.kind !== 'ok') throw new Error(attempt.kind);
    expect(exercises.mock.lastCall?.[1]).toMatchObject({ id: extension.id, objective: extension.objective, subtopics: extension.subtopics });
    await expect(submitTopicAttempt(learner.id, assigned.id, attempt.attemptId, {})).resolves.toMatchObject({ kind: 'ok', newTopicsAdded: 0 });
    expect(await submitPlacementTest(learner.id, input)).toMatchObject({ kind: 'ok', result: { topics: [] } });

    const second = await submitPlacementTest(other.id, input);
    if (second.kind !== 'ok') throw new Error(second.kind);
    const shared = second.topics.find(({ curriculumId }) => curriculumId === extension.id)!;
    expect(shared.id).not.toBe(assigned.id);
    expect(shared.key).toBe(assigned.key);
    expect(await getTopicStudy(learner.id, assigned.id)).toEqual(await getTopicStudy(other.id, shared.id));
    expect(lesson).toHaveBeenCalledTimes(1);
    expect(lesson.mock.lastCall?.[1]).toMatchObject({ id: extension.id, objective: extension.objective });
    expect((await pool.query("SELECT key FROM program_topics WHERE key = 'invented-topic'")).rowCount).toBe(0);
  } finally {
    exercises.mockRestore();
    lesson.mockRestore();
    grades.mockRestore();
    placement.mockRestore();
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[learner.id, other.id]]);
    await pool.query('DELETE FROM program_topics WHERE key = $1 OR curriculum_id = $2', [legacyKey, extension.id]);
    await pool.query('DELETE FROM curriculum_topics WHERE id = $1', [extension.id]);
  }
});
