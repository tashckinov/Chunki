import { randomUUID } from 'node:crypto';
import { MockGradingProvider, type PlacementTestSubmission, type CurriculumTopic } from '@app/shared';
import { afterAll, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { createCurriculumTopic, getTopicForReview, linkCurriculumTopic, listTopicsForReview, updateCurriculumTopic, updateTopicStudyForReview } from '../modules/program/topicCatalog.js';
import { generateTopicLevelStudy, readTopicLevelStudy, saveTopicLevelStudy } from '../modules/program/topicLevelStudy.js';
import { getGradingProvider } from '../grading/index.js';
import { getPlacementResult, getProgramForUser, getTopicStudy, getLearnerTopicLevelStudy, rebuildProgramFromLastTest, startTopicAttempt, submitPlacementTest, submitTopicAttempt } from '../modules/program/service.js';

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
  expect(await createCurriculumTopic(extension)).toMatchObject({ id: extension.id, topic_number: expect.any(Number) });
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
    expect(first.result.topics).toHaveLength(1);
    expect(first.result.topics[0]).toMatchObject({ title: extension.title, level: 'B1', category: 'Использование языка' });
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
    expect(shared.topicNumber).toBe(assigned.topicNumber);
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

it('adds all relevant recommendations to an existing program once, without regrading or using quota', async () => {
  const { rows: [learner] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const userId = learner.id;
  const submissionId = randomUUID();
  const input: PlacementTestSubmission = {
    submissionId, fromLevel: 'A2', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '',
  };
  const provider = getGradingProvider();
  const assessment = await provider.gradePlacementTest(input);
  const initialIds = ['a2-past-continuous', 'a2-requests', 'b1-second-conditional'];
  const grade = vi.spyOn(provider, 'gradePlacementTest').mockResolvedValue({
    ...assessment, overallLevel: 'A2', topics: initialIds.map((key) => ({ key, rationale: 'Исходная рекомендация' })),
  });
  const recommend = vi.spyOn(provider, 'recommendProgramTopics');
  try {
    expect(await submitPlacementTest(userId, input)).toMatchObject({ kind: 'ok' });
    const initial = await getProgramForUser(userId);
    if (initial.status !== 'active') throw new Error('No initial program');
    expect(initial.topics).toHaveLength(3);
    const existing = initial.topics[0];
    await pool.query("UPDATE user_topics SET status = 'mastered' WHERE id = $1", [existing.id]);
    await pool.query('UPDATE placement_tests SET program_built_at = NULL WHERE id = $1', [submissionId]);
    const saved = await getPlacementResult(userId, submissionId);
    const before = await getProgramForUser(userId);
    expect(before).toMatchObject({ needsProgramBuild: true, topics: expect.arrayContaining([{ ...existing, status: 'mastered' }]), placement: { quota: { used: 1 } } });

    recommend.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(rebuildProgramFromLastTest(userId)).rejects.toThrow('Provider unavailable');
    expect(await getProgramForUser(userId)).toMatchObject({ needsProgramBuild: true, topics: expect.arrayContaining([expect.objectContaining({ id: existing.id })]) });

    let notifyStarted!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const canFinish = new Promise<void>((resolve) => { finish = resolve; });
    recommend.mockImplementationOnce(async () => {
      notifyStarted();
      await canFinish;
      return [
        { key: 'a2-articles', rationale: 'Артикли' },
        { key: 'b1-present-perfect-past-simple', rationale: 'Выбор времени' },
        { key: 'b1-core-grammar-simple-passive', rationale: 'Пассив' },
        { key: 'b1-opinions', rationale: 'Выражение мнения' },
        { key: initialIds[0], rationale: 'Уже назначена' },
        { key: 'c1-negative-inversion', rationale: 'Уровень выше цели' },
        { key: 'invented-id', rationale: 'Такой цели нет' },
      ];
    });
    const build = rebuildProgramFromLastTest(userId);
    try {
      await Promise.race([started, build]);
      expect(await rebuildProgramFromLastTest(userId)).toBe('building');
    } finally {
      finish();
      await build;
    }
    expect(await build).toBe('ready');
    expect(await rebuildProgramFromLastTest(userId)).toBe('ready');
    expect(grade).toHaveBeenCalledTimes(1);
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(await getPlacementResult(userId, submissionId)).toEqual(saved);
    const after = await getProgramForUser(userId);
    expect(after).toMatchObject({
      needsProgramBuild: false,
      placement: before.placement,
      topics: expect.arrayContaining([
        expect.objectContaining({ id: existing.id, status: 'mastered' }),
        expect.objectContaining({ curriculumId: 'a2-articles', topicNumber: expect.any(Number) }),
      ]),
    });
    if (after.status !== 'active') throw new Error('No supplemented program');
    expect(after.topics.map(({ curriculumId }) => curriculumId).sort()).toEqual([
      ...initialIds, 'a2-articles', 'b1-present-perfect-past-simple', 'b1-core-grammar-simple-passive', 'b1-opinions',
    ].sort());
    expect(after.topics.every(({ level }) => level === 'A2' || level === 'B1')).toBe(true);
  } finally {
    grade.mockRestore();
    recommend.mockRestore();
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

it('shows unassigned curriculum topics by number and keeps the lesson key when editing', async () => {
  const firstPage = await listTopicsForReview('', 0);
  const numbers = firstPage.topics.map(({ topicNumber }) => topicNumber);
  expect(numbers).toEqual(numbers.slice().sort((a, b) => a! - b!));
  expect(numbers).toContain(4);
  const id = 'catalog-edit-' + randomUUID();
  try {
    const created = await createCurriculumTopic({
      id, title: id, level: 'A1', category: 'Vocabulary', objective: 'Начальная цель.', subtopics: [],
    });
    if (!created) throw new Error('Topic was not created');
    const { topics: [entry] } = await listTopicsForReview('№' + created.topic_number, 0);
    expect(entry).toMatchObject({ title: id, topicNumber: created.topic_number });
    const study = { explanation: '**Bread** — хлеб.', keyPoints: [], contrastExamples: [], exampleChunks: [] };
    expect(await updateTopicStudyForReview(entry.key, study)).toEqual(study);
    const updated = await updateCurriculumTopic({ ...created, title: 'Новое название ' + id, level: 'A2', category: 'Grammar' });
    expect(updated).toMatchObject({ id, topic_number: created.topic_number });
    expect(await getTopicForReview(entry.key)).toMatchObject({
      study, level: 'A2', category: 'Грамматика', title: updated?.title,
    });
  } finally {
    await pool.query('DELETE FROM program_topics WHERE curriculum_id = $1', [id]);
    await pool.query('DELETE FROM curriculum_topics WHERE id = $1', [id]);
  }
});

it('regenerates unstarted recommendations from the saved test and can reactivate the same assignment', async () => {
  const { rows: [learner] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const input: PlacementTestSubmission = { submissionId: randomUUID(), fromLevel: 'A2', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' };
  const provider = getGradingProvider();
  const assessment = await provider.gradePlacementTest(input);
  const existing = ['a2-articles', 'a2-past-continuous'];
  const grade = vi.spyOn(provider, 'gradePlacementTest').mockResolvedValue({
    ...assessment, overallLevel: 'A2', topics: existing.map((key) => ({ key, rationale: 'Тема из теста' })),
  });
  const recommend = vi.spyOn(provider, 'recommendProgramTopics');
  try {
    expect(await rebuildProgramFromLastTest(learner.id, 'replace_unstarted')).toBe('no_result');
    const result = await submitPlacementTest(learner.id, input);
    if (result.kind !== 'ok') throw new Error(result.kind);
    const [unstarted, started] = existing.map((id) => result.topics.find(({ curriculumId }) => curriculumId === id)!);
    const attempt = await startTopicAttempt(learner.id, started.id);
    expect(attempt.kind).toBe('ok');

    recommend.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(rebuildProgramFromLastTest(learner.id, 'replace_unstarted')).rejects.toThrow('Provider unavailable');
    expect(await getProgramForUser(learner.id)).toMatchObject({ topics: expect.arrayContaining([unstarted, started]) });

    recommend.mockResolvedValueOnce([{ key: 'b1-second-conditional', rationale: 'Новая рекомендация' }]);
    expect(await rebuildProgramFromLastTest(learner.id, 'replace_unstarted')).toBe('ready');
    expect(recommend.mock.lastCall?.[1].assignedKeys).toEqual([started.curriculumId]);
    const updated = await getProgramForUser(learner.id);
    if (updated.status !== 'active') throw new Error('Program missing');
    expect(updated.topics.map(({ curriculumId }) => curriculumId).sort()).toEqual([started.curriculumId, 'b1-second-conditional']);
    expect(updated.placement.quota.used).toBe(1);
    expect(await getTopicStudy(learner.id, unstarted.id)).toEqual({ kind: 'not_found' });

    recommend.mockResolvedValueOnce([{ key: 'a2-articles', rationale: 'Снова назначена' }]);
    expect(await rebuildProgramFromLastTest(learner.id, 'replace_unstarted')).toBe('ready');
    expect(await getProgramForUser(learner.id)).toMatchObject({ topics: expect.arrayContaining([
      expect.objectContaining({ id: unstarted.id, rationale: 'Снова назначена' }), started,
    ]) });
    expect(grade).toHaveBeenCalledTimes(1);
  } finally {
    grade.mockRestore();
    recommend.mockRestore();
    await pool.query('DELETE FROM users WHERE id = $1', [learner.id]);
  }
});

it('selects additional material by assessed level and reuses it across learners', async () => {
  const { rows: users } = await pool.query<{ id: string }>(
    'INSERT INTO users (is_admin) VALUES (false), (false), (false) RETURNING id',
  );
  const topicId = 'study-level-' + randomUUID();
  const input: PlacementTestSubmission = { fromLevel: 'B1', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' };
  const provider = getGradingProvider();
  const assessment = await provider.gradePlacementTest(input);
  const grade = vi.spyOn(provider, 'gradePlacementTest');
  const generate = vi.spyOn(provider, 'generateTopicStudy').mockImplementation(async (_topic, _scope, level) => ({
    explanation: 'Материал ' + level, keyPoints: [], contrastExamples: [], exampleChunks: [],
  }));

  try {
    await createCurriculumTopic({
      id: topicId, title: 'Проверка ' + topicId, level: 'B1', category: 'Grammar', objective: 'Учебная цель.', subtopics: [],
    });
    const learnerTopics = [];
    const assessedLevels = ['A1', 'A1', 'A2+'] as const;
    for (const [i, user] of users.entries()) {
      grade.mockResolvedValueOnce({
        ...assessment, overallLevel: assessedLevels[i], topics: [{ key: topicId, rationale: 'Нужна практика.' }],
      });
      const result = await submitPlacementTest(user.id, input);
      if (result.kind !== 'ok') throw new Error(result.kind);
      learnerTopics.push(result.topics[0]);
    }
    const [first, second, third] = learnerTopics;
    await expect(getLearnerTopicLevelStudy(users[0].id, first.id, false)).resolves.toEqual({
      kind: 'ok', material: { level: 'A1', study: null, generating: false },
    });
    await expect(getLearnerTopicLevelStudy(users[1].id, first.id, true)).resolves.toEqual({ kind: 'not_found' });
    const firstStudy = await getLearnerTopicLevelStudy(users[0].id, first.id, true);
    expect(firstStudy).toMatchObject({ kind: 'ok', material: { level: 'A1', study: { explanation: 'Материал A1' } } });
    expect(await getLearnerTopicLevelStudy(users[1].id, second.id, true)).toEqual(firstStudy);
    expect(await getLearnerTopicLevelStudy(users[2].id, third.id, true)).toMatchObject({
      kind: 'ok', material: { level: 'A2', study: { explanation: 'Материал A2' } },
    });
    expect(generate.mock.calls.map((call) => call[2])).toEqual(['A1', 'A2']);
    expect((await getTopicForReview(first.key))?.study).toBeNull();
  } finally {
    generate.mockRestore();
    grade.mockRestore();
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users.map(({ id }) => id)]);
    await pool.query('DELETE FROM program_topics WHERE curriculum_id = $1', [topicId]);
    await pool.query('DELETE FROM curriculum_topics WHERE id = $1', [topicId]);
  }
});

it('serializes generation for the same topic and level and preserves a concurrent manual save', async () => {
  const { rows: [user] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const key = 'study-lease-' + randomUUID();
  const topic = { key, title: key, level: 'A1', category: 'Грамматика' } as const;
  const manual = { explanation: 'Материал редактора', keyPoints: [], contrastExamples: [], exampleChunks: [] };

  await pool.query('INSERT INTO program_topics (key, title, level, category) VALUES ($1, $1, $2, $3)', [key, topic.level, topic.category]);
  const generate = vi.spyOn(getGradingProvider(), 'generateTopicStudy');
  try {
    generate.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(generateTopicLevelStudy(user.id, topic, 'A1')).rejects.toThrow('Provider unavailable');
    await expect(readTopicLevelStudy(key, 'A1')).resolves.toEqual({ level: 'A1', study: null, generating: false });

    let markStarted!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const canFinish = new Promise<void>((resolve) => { finish = resolve; });
    generate.mockImplementationOnce(async () => {
      markStarted();
      await canFinish;
      return { ...manual, explanation: 'Материал модели' };
    });
    const pending = generateTopicLevelStudy(user.id, topic, 'A1');
    try {
      await Promise.race([started, pending]);
      expect(await generateTopicLevelStudy(user.id, topic, 'A1')).toEqual({ level: 'A1', study: null, generating: true });
      await saveTopicLevelStudy(key, 'A1', manual);
    } finally {
      finish();
      await pending;
    }
    expect(await pending).toEqual({ level: 'A1', study: manual, generating: false });
    expect(generate).toHaveBeenCalledTimes(2);
  } finally {
    generate.mockRestore();
    await pool.query('DELETE FROM program_topics WHERE key = $1', [key]);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  }
});
