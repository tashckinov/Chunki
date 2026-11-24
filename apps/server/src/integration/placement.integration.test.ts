import { listTopicStudySuggestions, topicStudySuggestion } from '../modules/program/topicStudySuggestions.js';
import { rateTopicStudy } from '../modules/program/topicStudyRating.js';
import { randomUUID } from 'node:crypto';
import { MockGradingProvider, type PlacementTestSubmission, type CurriculumTopic } from '@app/shared';
import { afterAll, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { createCurriculumTopic, getTopicForReview, linkCurriculumTopic, listTopicsForReview, setTopicVerification, updateCurriculumTopic, updateTopicStudyForReview } from '../modules/program/topicCatalog.js';
import { getGradingProvider } from '../grading/index.js';
import { getPlacementResult, getProgramForUser, getTopicStudy, rebuildProgramFromLastTest, startTopicAttempt, submitPlacementTest, submitTopicAttempt } from '../modules/program/service.js';

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
    const { listLearningModules } = await import('../modules/program/learningModules.js');
    const { importCurriculumModules, deleteCurriculumModule } = await import('../modules/admin/curriculumModules.js');
    const moduleId = 'fixture-' + randomUUID();
    try {
      expect((await importCurriculumModules([{
        id: moduleId, title: 'Артикли и время', description: 'Повторить основы.',
        level: 'A2', position: 0, type: 'core', topicIds: ['a2-articles', 'a2-past-continuous'],
      }], false)).issues).toEqual([]);
      expect(await listLearningModules(other.id)).toEqual([]);
      expect(await listLearningModules(learner.id)).toContainEqual(expect.objectContaining({
        id: moduleId, topics: [
          expect.objectContaining({ id: 'a2-articles' }),
          expect.objectContaining({ id: 'a2-past-continuous' }),
        ],
      }));
      const program = await getProgramForUser(learner.id);
      if (program.status !== 'active') throw new Error('No learning program');
      expect(program.topics.map(({ curriculumId }) => curriculumId)).not.toContain('a2-past-continuous');
    } finally {
      await deleteCurriculumModule(moduleId);
    }
    expect(lesson).not.toHaveBeenCalled();

    const assigned = first.topics.find(({ curriculumId }) => curriculumId === extension.id)!;
    const attempt = await startTopicAttempt(learner.id, assigned.id);
    if (attempt.kind !== 'ok') throw new Error(attempt.kind);
    expect(await startTopicAttempt(learner.id, assigned.id)).toEqual(attempt);
    expect(exercises).toHaveBeenCalledTimes(1);
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
    expect(await topicStudySuggestion(learner.id, assigned.id)).toBeNull();
    expect(await topicStudySuggestion(other.id, assigned.id, 'Чужая тема')).toBeUndefined();
    await topicStudySuggestion(learner.id, assigned.id, 'Добавьте пример');
    await topicStudySuggestion(learner.id, assigned.id, 'Добавьте пример с вопросом');
    expect(await topicStudySuggestion(other.id, shared.id)).toBeNull();
    expect(await topicStudySuggestion(learner.id, assigned.id)).toBe('Добавьте пример с вопросом');
    expect(await listTopicStudySuggestions(shared.key, 0)).toMatchObject({
      suggestions: [{ userId: learner.id, message: 'Добавьте пример с вопросом' }], nextOffset: null,
    });
    await pool.query("UPDATE topic_study_suggestions SET updated_at = now() - interval '1 second' WHERE topic_key = $1", [shared.key]);
    await topicStudySuggestion(learner.id, legacy.id, 'Поясните исключения');
    const inbox = await listTopicStudySuggestions(null, 0);
    expect(inbox.suggestions.slice(0, 2)).toMatchObject([
      { topicKey: legacyKey, message: 'Поясните исключения' },
      { topicKey: shared.key, title: extension.title, topicNumber: shared.topicNumber, message: 'Добавьте пример с вопросом' },
    ]);
    expect(await rateTopicStudy(other.id, assigned.id, 'clear')).toBeUndefined();
    expect(await rateTopicStudy(learner.id, assigned.id)).toBeNull();
    await rateTopicStudy(learner.id, assigned.id, 'clear');
    await rateTopicStudy(other.id, shared.id, 'unclear');
    await rateTopicStudy(learner.id, assigned.id, 'unclear');
    expect(await rateTopicStudy(learner.id, assigned.id)).toBe('unclear');
    expect((await getTopicForReview(shared.key))?.ratings).toEqual({ clear: 0, unclear: 2 });
    expect((await listTopicsForReview('№' + shared.topicNumber, 0)).topics[0]).toMatchObject({ clear: 0, unclear: 2 });
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
    expect(await setTopicVerification(entry.key, true, study)).toBeNull();
    expect(await updateTopicStudyForReview(entry.key, study)).toEqual(study);
    expect(await setTopicVerification(entry.key, true, study)).toEqual({ verified: true });
    expect((await listTopicsForReview('№' + created.topic_number, 0)).topics[0].verified).toBe(true);
    await updateTopicStudyForReview(entry.key, study);
    expect((await getTopicForReview(entry.key))?.verified).toBe(true);
    await updateTopicStudyForReview(entry.key, { ...study, explanation: 'Новая версия.' });
    expect((await getTopicForReview(entry.key))?.verified).toBe(false);
    expect(await setTopicVerification(entry.key, true, study)).toBeNull();
    await updateTopicStudyForReview(entry.key, study);
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

it('lists one topic per CEFR number and keeps linked lesson variants editable', async () => {
  const suffix = randomUUID();
  const before = await listTopicsForReview('№1', 0);
  const canonical = before.topics[0];
  const alternateKey = 'older-be-' + suffix;
  const alias = 'older-alias-' + suffix;
  const alternateTitle = canonical.title + ' · ' + suffix;
  const original = { explanation: 'Старый урок.', keyPoints: [], contrastExamples: [], exampleChunks: [] };
  const revised = { ...original, explanation: 'Обновлённый урок.' };

  await pool.query(
    `INSERT INTO program_topics (key, title, category, level, curriculum_id, aliases, study_content)
     VALUES ($1, $2, 'Грамматика', 'A1', 'a1-verb-to-be', ARRAY[$3::text], $4)`,
    [alternateKey, alternateTitle, alias, original],
  );
  try {
    expect((await listTopicsForReview('', 0)).topics.filter(({ topicNumber }) => topicNumber === 1)).toEqual([canonical]);
    expect((await listTopicsForReview('№1', 0)).topics).toEqual([canonical]);
    expect((await listTopicsForReview(alias, 0)).topics).toEqual([canonical]);
    expect((await getTopicForReview(canonical.key))?.variants).toContainEqual({
      key: alternateKey, title: alternateTitle, curriculumSlot: false,
    });
    expect(await getTopicForReview(alternateKey)).toMatchObject({
      study: original, variants: expect.arrayContaining([expect.objectContaining({ key: canonical.key, curriculumSlot: true })]),
    });
    expect(await updateTopicStudyForReview(alternateKey, revised)).toEqual(revised);
    expect((await getTopicForReview(alternateKey))?.study).toEqual(revised);
    expect((await getTopicForReview(canonical.key))?.study).not.toEqual(revised);
  } finally {
    await pool.query('DELETE FROM program_topics WHERE key = $1', [alternateKey]);
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

it('keeps the current lesson ahead of newly assigned easier topics', async () => {
  const { rows: [learner] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const input: PlacementTestSubmission = { fromLevel: 'A1', toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' };
  const provider = getGradingProvider();
  const assessment = await provider.gradePlacementTest(input);
  const grade = vi.spyOn(provider, 'gradePlacementTest');
  try {
    const setPicks = (ids: string[]) => grade.mockResolvedValueOnce({
      ...assessment, overallLevel: 'A1', topics: ids.map((key) => ({ key, rationale: 'Практика' })),
    });
    setPicks(['b1-second-conditional', 'a2-articles']);
    const first = await submitPlacementTest(learner.id, input);
    if (first.kind !== 'ok') throw new Error(first.kind);
    expect(first.topics.map(({ curriculumId }) => curriculumId)).toEqual(['a2-articles', 'b1-second-conditional']);
    const [completed, current] = first.topics;
    await pool.query("UPDATE user_topics SET status = 'mastered' WHERE id = $1", [completed.id]);
    expect((await startTopicAttempt(learner.id, current.id)).kind).toBe('ok');

    await pool.query("UPDATE placement_tests SET created_at = created_at - interval '1 month' WHERE user_id = $1", [learner.id]);
    setPicks(['a2-requests', 'a1-verb-to-be']);
    const second = await submitPlacementTest(learner.id, input);
    if (second.kind !== 'ok') throw new Error(second.kind);
    expect(second.topics.map(({ curriculumId }) => curriculumId)).toEqual([
      'a2-articles', 'b1-second-conditional', 'a1-verb-to-be', 'a2-requests',
    ]);
  } finally {
    grade.mockRestore();
    await pool.query('DELETE FROM users WHERE id = $1', [learner.id]);
  }
});

it('exposes curriculum topics before sign-in or placement', async () => {
  const { default: Fastify } = await import('fastify');
  const { programRoutes } = await import('../modules/program/routes.js');
  const app = Fastify();
  try {
    await app.register(programRoutes, { prefix: '/api/program' });
    const response = await app.inject('/api/program/catalog');
    expect(response.statusCode).toBe(200);
    const { rows: [total] } = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM curriculum_topics');
    const { topics } = response.json();
    expect(topics).toHaveLength(total.count);
    expect(topics).toContainEqual({
      id: 'a1-verb-to-be', level: 'A1', title: expect.any(String), objective: expect.any(String),
    });
    const preview = await app.inject('/api/program/catalog-preview');
    expect(preview.statusCode).toBe(200);
    const { total: previewTotal, levels } = preview.json();
    expect(previewTotal).toBe(total.count);
    expect(levels.map(({ level }: { level: string }) => level)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
    for (const group of levels) {
      expect(group.topics).toHaveLength(5);
      for (const { id, title } of group.topics) {
        expect(topics).toContainEqual(expect.objectContaining({ id, title, level: group.level }));
      }
    }
  } finally {
    await app.close();
  }
});

it('previews and atomically imports module links without changing curriculum topics', async () => {
  const { importCurriculumModules, listCurriculumModules, deleteCurriculumModule } = await import('../modules/admin/curriculumModules.js');
  const id = 'fixture-' + randomUUID();
  const module = {
    id, title: 'Знакомство', description: 'Представиться.', level: 'A1',
    type: 'core', position: 10, topicIds: ['a1-core-functions-greetings', 'a1-verb-to-be'],
  } as const;
  const input = { ...module, topicIds: [...module.topicIds] };

  try {
    expect(await importCurriculumModules([input], true)).toMatchObject({ issues: [], changes: [{ action: 'create' }] });
    expect((await listCurriculumModules()).find((entry) => entry.id === id)).toBeUndefined();
    const rejected = await importCurriculumModules([input, { ...input, id: id + '-invalid', topicIds: ['missing-topic', 'b1-opinions', 'b1-opinions'] }], false);
    expect(rejected.issues).toHaveLength(4);
    expect((await listCurriculumModules()).find((entry) => entry.id === id)).toBeUndefined();
    expect((await importCurriculumModules([input], false)).issues).toEqual([]);
    expect((await listCurriculumModules()).find((entry) => entry.id === id)).toEqual(input);
    const revised = { ...input, topicIds: ['a1-verb-to-be'] };
    expect(await importCurriculumModules([revised], false)).toMatchObject({ issues: [], changes: [{ action: 'update' }] });
    expect((await listCurriculumModules()).find((entry) => entry.id === id)).toEqual(revised);
    expect(await deleteCurriculumModule(id)).toBe(true);
    const { rows } = await pool.query('SELECT id FROM curriculum_topics WHERE id = ANY($1::text[])', [input.topicIds]);
    expect(rows).toHaveLength(2);
  } finally {
    await deleteCurriculumModule(id);
  }
});
