import { randomUUID } from 'node:crypto';
import { MockGradingProvider, type PlacementTestSubmission, type TopicSuggestion } from '@app/shared';
import { afterAll, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
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

it('reuses canonical topics and lessons, filters levels and never assigns a mastered topic twice', async () => {
  const { rows: [learner, other] } = await pool.query<{ id: string }>(
    'INSERT INTO users (is_admin) VALUES (true), (true) RETURNING id',
  );
  const suffix = randomUUID();
  const topic = (key: string, title: string, level: TopicSuggestion['level']): TopicSuggestion =>
    ({ key, title, level, category: 'Грамматика', rationale: 'Личное пояснение ученика' });
  const articles = topic('articles-a-an-the', 'Артикли: a, an, the', 'A2');
  const extension = topic(`requests-${suffix}`, `Вежливые просьбы ${suffix}`, 'B1');
  const candidates = [
    articles,
    topic('english-articles', 'Артикли', 'B1'),
    topic('inversion-after-negative-adverbials', 'Инверсия', 'B1'),
    topic(`advanced-${suffix}`, 'Новая тема C1', 'C1'),
    topic('to-be', 'Глагол to be', 'A1'),
    extension,
  ];
  const input: PlacementTestSubmission = { fromLevel: 'A2', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' };
  const provider = getGradingProvider();
  const grade = await provider.gradePlacementTest(input);
  const placement = vi.spyOn(provider, 'gradePlacementTest').mockResolvedValue({ ...grade, overallLevel: 'A2', topics: candidates });
  const grades = vi.spyOn(provider, 'gradeExercises').mockResolvedValue({
    scoreOutOf10: 10, passed: true, verdictLabel: 'Отлично', notes: [],
    discoveredTopics: candidates, nextReviewInDays: 0,
  });
  const lesson = vi.spyOn(provider, 'generateTopicStudy');

  try {
    const first = await submitPlacementTest(learner.id, input);
    if (first.kind !== 'ok') throw new Error(first.kind);
    expect(first.topics.map(({ key, level }) => [key, level]).sort()).toEqual([['articles', 'A2'], [extension.key, 'B1']]);
    expect(placement.mock.lastCall?.[2]?.catalog.some(({ key }) => key === 'articles')).toBe(true);
    const assignedArticles = first.topics.find(({ key }) => key === 'articles');
    if (!assignedArticles) throw new Error('Missing articles topic');
    expect(assignedArticles.title).toBe('Артикли: a, an, the');
    const { id } = assignedArticles;

    for (let i = 0; i < 2; i += 1) {
      const attempt = await startTopicAttempt(learner.id, id);
      if (attempt.kind !== 'ok') throw new Error(attempt.kind);
      await expect(submitTopicAttempt(learner.id, id, attempt.attemptId, {})).resolves.toMatchObject({ kind: 'ok', newTopicsAdded: 0 });
    }

    placement.mockResolvedValueOnce({ ...grade, overallLevel: 'A2', topics: [
      { ...articles, key: 'unused-slug', title: 'Артикли', level: 'B1' },
      { ...extension, key: `renamed-${suffix}`, title: `Вежливые просьбы: ${suffix}` },
    ] });
    const retest = await submitPlacementTest(learner.id, input);
    if (retest.kind !== 'ok') throw new Error(retest.kind);
    expect(retest.result.topics).toEqual([]);
    expect(retest.topics).toHaveLength(2);
    expect(retest.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, key: 'articles', status: 'mastered' }),
      expect.objectContaining({ key: extension.key, level: 'B1' }),
    ]));
    expect(placement.mock.lastCall?.[2]?.assignedKeys).toContain('articles');

    const second = await submitPlacementTest(other.id, input);
    if (second.kind !== 'ok') throw new Error(second.kind);
    expect(placement.mock.lastCall?.[2]?.catalog).toContainEqual(expect.objectContaining({ key: extension.key, level: 'B1' }));
    const sharedArticles = second.topics.find(({ key }) => key === 'articles');
    if (!sharedArticles) throw new Error('Missing shared articles topic');
    expect(sharedArticles.status).toBe('assigned');
    expect(sharedArticles.id).not.toBe(id);
    const ownExtension = first.topics.find(({ key }) => key === extension.key);
    const sharedExtension = second.topics.find(({ key }) => key === extension.key);
    if (!ownExtension || !sharedExtension) throw new Error('Missing shared extension');
    expect(await getTopicStudy(learner.id, ownExtension.id)).toEqual(await getTopicStudy(other.id, sharedExtension.id));
    expect(lesson).toHaveBeenCalledTimes(1);
    expect(lesson.mock.lastCall?.[0]).not.toHaveProperty('rationale');
  } finally {
    lesson.mockRestore();
    grades.mockRestore();
    placement.mockRestore();
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[learner.id, other.id]]);
    await pool.query('DELETE FROM program_topics WHERE key = ANY($1::text[])', [[extension.key, `advanced-${suffix}`, `renamed-${suffix}`]]);
  }
});
