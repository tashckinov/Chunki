import type { CEFRLevel, ExerciseItem, ExercisesGradeResult, PlacementGradeResult, PlacementOverview, PlacementQuota, PlacementResultSummary, PlacementTestSubmission, TopicStudyContent, TopicIdentity, TopicPlanContext } from '@app/shared';
import { findGrammarTest } from '../grammarTests/repository.js';
import { getGradingProvider } from '../../grading/index.js';
import { withAiCallLogging } from '../aiLogs/service.js';
import { resolveEffectiveTariff, resolvePlacementAccess, listUpsellTariffs, type PublicTariff } from '../subscriptionTariffs/service.js';
import {
  createAttempt,
  countPlacementTests,
  findPlacementResult,
  listPlacementTests,
  releasePlacementCheck,
  reservePlacementCheck,
  savePlacementTest,
  saveProgramBuild,
  findAttempt,
  findUserTopic,
  findUserTopics,
  listAssignedTopicKeys,
  listRecentActivityForAdmin as repoListRecentActivityForAdmin,
  saveTopicGrade,
  type TopicStatusPatch,
  type TopicAttemptKind,
  type UserTopicRow,
  type UserTopicSource,
  type UserTopicStatus,
} from './repository.js';
import { buildPlacementReview } from './placementReview.js';
import { listCurriculumTopics, saveCatalogStudy, topicLevels } from './topicCatalog.js';

export interface UserTopicSummary {
  id: string;
  key: string;
  title: string;
  category: string;
  curriculumId: string | null;
  topicNumber: number | null;
  level: CEFRLevel | null;
  rationale: string;
  source: UserTopicSource;
  status: UserTopicStatus;
  nextReviewAt: string | null;
  masteredAt: string | null;
}

function toSummary(row: UserTopicRow): UserTopicSummary {
  return {
    id: row.id,
    ...toTopicIdentity(row),
    curriculumId: row.curriculum?.id ?? null,
    topicNumber: row.curriculum?.topic_number ?? null,
    rationale: row.rationale,
    source: row.source,
    status: row.status,
    nextReviewAt: row.next_review_at ? row.next_review_at.toISOString() : null,
    masteredAt: row.mastered_at ? row.mastered_at.toISOString() : null,
  };
}

function toTopicIdentity(row: UserTopicRow): TopicIdentity {
  return { key: row.catalog_key, title: row.catalog_title, category: row.catalog_category, level: row.level };
}

function visibleTopics(topics: UserTopicRow[], current: CEFRLevel | null, target: CEFRLevel | null): UserTopicSummary[] {
  if (!current || !target) return topics.map(toSummary);
  const levels = topicLevels(current, target);
  const upToTarget = topicLevels('A1', target);
  return topics.filter((topic) => !topic.level || (topic.status === 'mastered' ? upToTarget : levels).includes(topic.level)).map(toSummary);
}

async function topicPlan(userId: string, currentLevel: CEFRLevel | null, targetLevel: CEFRLevel): Promise<TopicPlanContext> {
  const [catalog, assignedKeys] = await Promise.all([listCurriculumTopics(targetLevel), listAssignedTopicKeys(userId)]);
  return { catalog, assignedKeys, currentLevel, targetLevel };
}

export type ProgramForUser = ({ status: 'none' } | { status: 'active'; topics: UserTopicSummary[] }) & { placement: PlacementOverview; needsProgramBuild?: boolean };

async function placementQuota(userId: string, access: Awaited<ReturnType<typeof resolvePlacementAccess>>): Promise<PlacementQuota> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startsAt = new Date(Date.UTC(year, month, 1));
  const resetsAt = new Date(Date.UTC(year, month + 1, 1));
  const used = await countPlacementTests(userId, startsAt, resetsAt);
  return { allowed: access.allowed, limit: access.limit, used, resetsAt: resetsAt.toISOString() };
}

export async function getPlacementQuota(userId: string): Promise<PlacementQuota> {
  return placementQuota(userId, await resolvePlacementAccess(userId));
}

function toPlacementSummary(row: Awaited<ReturnType<typeof listPlacementTests>>[number]): PlacementResultSummary {
  return {
    id: row.id,
    variantId: row.variant_id ?? 'builtin',
    level: row.overall_level,
    goal: row.to_level,
    purpose: row.purpose ?? [],
    completedAt: row.created_at.toISOString(),
  };
}

export async function getProgramForUser(userId: string): Promise<ProgramForUser> {
  const [topics, history, quota] = await Promise.all([findUserTopics(userId), listPlacementTests(userId), getPlacementQuota(userId)]);
  const placement = { history: history.map(toPlacementSummary), quota };
  if (topics.length === 0 && history.length === 0) return { status: 'none', placement };
  const latest = history[0];
  return {
    status: 'active',
    topics: visibleTopics(topics, latest?.overall_level ?? null, latest?.to_level ?? null),
    placement,
    needsProgramBuild: quota.allowed && topics.length === 0 && !!latest && !latest.program_built_at,
  };
}

export async function getPlacementResult(userId: string, id: string): Promise<{ summary: PlacementResultSummary; result: PlacementGradeResult } | null> {
  const row = await findPlacementResult(userId, id);
  if (!row) return null;
  const definition = await findGrammarTest(row.variant_id ?? undefined);
  const result: PlacementGradeResult = {
    overallLevel: row.overall_level,
    skills: row.skills,
    aboveLevel: row.above_level,
    belowLevel: row.below_level,
    mcqScore: row.mcq_score,
    openGrades: row.open_grades,
    essayGrade: row.essay_grade,
    topics: [],
  };
  if (definition) result.review = buildPlacementReview(definition, {
    mcqAnswers: row.mcq_answers, open9: row.open9, open10: row.open10, essay: row.essay,
  }, result);
  return { summary: toPlacementSummary(row), result };
}

/** Null means allowed — otherwise the upsell tariffs to show for the blocked "not_allowed" result. */
async function checkProgramAllowed(userId: string): Promise<PublicTariff[] | null> {
  const tariff = await resolveEffectiveTariff(userId);
  if (tariff.unrestricted || tariff.allowProgram) return null;
  return listUpsellTariffs(tariff.id);
}

export type SubmitPlacementTestResult =
  | { kind: 'variant_not_found' }
  | { kind: 'already_checking' }
  | { kind: 'limit_reached'; quota: PlacementQuota }
  | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] }
  | { kind: 'ok'; result: PlacementGradeResult; topics: UserTopicSummary[] };

export async function submitPlacementTest(userId: string, input: PlacementTestSubmission): Promise<SubmitPlacementTestResult> {
  const token = await reservePlacementCheck(userId);
  if (!token) return { kind: 'already_checking' };
  try {
    if (input.submissionId) {
      const saved = await getPlacementResult(userId, input.submissionId);
      if (saved) {
        const [rows, history] = await Promise.all([findUserTopics(userId), listPlacementTests(userId)]);
        const topics = visibleTopics(rows, history[0]?.overall_level ?? saved.summary.level, history[0]?.to_level ?? saved.summary.goal);
        return { kind: 'ok', result: saved.result, topics };
      }
    }

    const access = await resolvePlacementAccess(userId);
    if (!access.allowed) return { kind: 'not_allowed', upsellTariffs: await listUpsellTariffs(access.tariffId) };
    const quota = await placementQuota(userId, access);
    if (quota.limit !== null && quota.used >= quota.limit) return { kind: 'limit_reached', quota };

    const definition = await findGrammarTest(input.variantId);
    if (!definition) return { kind: 'variant_not_found' };
    const plan = await topicPlan(userId, input.fromLevel, input.toLevel);
    const provider = getGradingProvider();
    const grade = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: input }, () => provider.gradePlacementTest(input, definition, plan));
    const assigned = await savePlacementTest({
      ...input,
      userId,
      variantId: input.variantId === 'builtin' ? undefined : input.variantId,
      overallLevel: grade.overallLevel,
      skills: grade.skills,
      aboveLevel: grade.aboveLevel,
      belowLevel: grade.belowLevel,
      mcqScore: grade.mcqScore,
      openGrades: grade.openGrades,
      essayGrade: grade.essayGrade,
    }, grade.topics, topicLevels(grade.overallLevel, input.toLevel), token);

    const topics = visibleTopics(await findUserTopics(userId), grade.overallLevel, input.toLevel);
    return { kind: 'ok', result: { ...grade, topics: assigned, review: buildPlacementReview(definition, input, grade) }, topics };
  } finally {
    // A stale lock expires even if the database is unavailable during cleanup.
    await releasePlacementCheck(userId, token).catch(() => {});
  }
}

export async function rebuildProgramFromLastTest(userId: string): Promise<'ready' | 'building' | 'not_allowed'> {
  const token = await reservePlacementCheck(userId);
  if (!token) return 'building';
  try {
    const [history, assigned] = await Promise.all([listPlacementTests(userId), findUserTopics(userId)]);
    const latest = history[0];
    if (!latest || latest.program_built_at || assigned.length > 0) return 'ready';
    if (!(await resolvePlacementAccess(userId)).allowed) return 'not_allowed';

    const saved = await getPlacementResult(userId, latest.id);
    if (!saved) return 'ready';
    const levels = topicLevels(latest.overall_level, latest.to_level);
    const catalog = (await listCurriculumTopics(latest.to_level)).filter(({ level }) => levels.includes(level));
    const { skills, mcqScore, belowLevel, review = [] } = saved.result;
    const corrections = review.map(({ key, prompt, answer, correction, feedback, grammar }) => ({
      prompt, answer: Number(key) <= mcqScore.total ? answer : '', correction, feedback, grammar,
    }));
    const provider = getGradingProvider();
    const plan = { catalog, assignedKeys: [], currentLevel: latest.overall_level, targetLevel: latest.to_level };
    const topics = catalog.length ? await withAiCallLogging({
      userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: { placementId: latest.id },
    }, () => provider.recommendProgramTopics({ skills, mcqScore, belowLevel, corrections }, plan)) : [];

    const available = new Set(catalog.map(({ id }) => id));
    const selected = topics.filter(({ key }) => available.has(key));
    const fallback = catalog.slice(0, 3).map(({ id, level }) => ({
      key: id, rationale: `Практика уровня ${level} по результатам входного теста.`,
    }));
    await saveProgramBuild(userId, latest.id, selected.length ? selected : fallback, levels, token);
    return 'ready';
  } finally {
    await releasePlacementCheck(userId, token).catch(() => {});
  }
}

export type TopicStudyResult = { kind: 'not_found' } | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] } | { kind: 'ok'; study: TopicStudyContent };

export async function getTopicStudy(userId: string, userTopicId: string): Promise<TopicStudyResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };
  if (row.study_content) return { kind: 'ok', study: row.study_content as TopicStudyContent };
  if (row.catalog_study) return { kind: 'ok', study: row.catalog_study };

  const upsellTariffs = await checkProgramAllowed(userId);
  if (upsellTariffs) return { kind: 'not_allowed', upsellTariffs };

  const provider = getGradingProvider();
  const topic = toTopicIdentity(row);
  const study = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: row.curriculum ?? topic }, () => provider.generateTopicStudy(topic, row.curriculum ?? undefined));

  return { kind: 'ok', study: await saveCatalogStudy(topic, study, row.curriculum?.id ?? null) };
}

export type RedactedExerciseItem = { type: 'choice'; q: string; options: string[] } | { type: 'write'; q: string; rows: number; placeholder: string };

function redact(items: ExerciseItem[]): RedactedExerciseItem[] {
  return items.map((item) => (item.type === 'choice' ? { type: 'choice', q: item.q, options: item.options } : item));
}

export type StartAttemptResult =
  | { kind: 'not_found' }
  | { kind: 'already_mastered' }
  | { kind: 'not_due' }
  | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] }
  | { kind: 'ok'; attemptId: string; attemptKind: TopicAttemptKind; items: RedactedExerciseItem[] };

export async function startTopicAttempt(userId: string, userTopicId: string): Promise<StartAttemptResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };
  if (row.status === 'mastered') return { kind: 'already_mastered' };

  const attemptKind: TopicAttemptKind = row.status === 'passed_once' ? 'reconfirm' : 'initial';
  if (attemptKind === 'reconfirm' && row.next_review_at && row.next_review_at.getTime() > Date.now()) {
    return { kind: 'not_due' };
  }

  const upsellTariffs = await checkProgramAllowed(userId);
  if (upsellTariffs) return { kind: 'not_allowed', upsellTariffs };

  const provider = getGradingProvider();
  const topic = { ...toTopicIdentity(row), rationale: row.rationale };
  const items = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: row.curriculum ?? topic }, () => provider.generateTopicExercises(topic, row.curriculum ?? undefined));

  const attempt = await createAttempt(row.id, attemptKind, items);
  return { kind: 'ok', attemptId: attempt.id, attemptKind, items: redact(items) };
}

export type SubmitAttemptResult =
  | { kind: 'not_found' }
  | { kind: 'attempt_not_found' }
  | { kind: 'already_graded' }
  | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] }
  | { kind: 'ok'; result: ExercisesGradeResult; newTopicsAdded: number };

export async function submitTopicAttempt(userId: string, userTopicId: string, attemptId: string, answers: Record<number, string>): Promise<SubmitAttemptResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };

  const attempt = await findAttempt(attemptId);
  if (!attempt || attempt.user_topic_id !== row.id) return { kind: 'attempt_not_found' };
  if (attempt.graded_at) return { kind: 'already_graded' };

  const upsellTariffs = await checkProgramAllowed(userId);
  if (upsellTariffs) return { kind: 'not_allowed', upsellTariffs };

  const items = attempt.items as ExerciseItem[];
  const topic = { ...toTopicIdentity(row), rationale: row.rationale };
  const gradeInput = { topic, items, answers };
  const [latest] = await listPlacementTests(userId);
  const plan = latest ? await topicPlan(userId, latest.overall_level, latest.to_level) : undefined;

  const provider = getGradingProvider();
  const result = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: gradeInput }, () => provider.gradeExercises(gradeInput, plan));

  // Re-read the learning goal after the provider call in case a placement
  // test completed while these exercises were being graded.
  const [current] = await listPlacementTests(userId);
  const levels = current ? topicLevels(current.overall_level, current.to_level) : [];
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + result.nextReviewInDays * 86400000);
  let progress: TopicStatusPatch = { status: 'assigned' };
  if (result.passed) {
    progress = attempt.kind === 'initial'
      ? { status: 'passed_once', passedOnceAt: now, nextReviewAt }
      : { status: 'mastered', passedOnceAt: row.passed_once_at, masteredAt: now };
  }
  const inserted = await saveTopicGrade(userId, attempt,
    { answers, scoreOutOf10: result.scoreOutOf10, passed: result.passed, notes: result.notes, discoveredTopics: result.discoveredTopics },
    progress, levels);
  if (!inserted) return { kind: 'already_graded' };
  return { kind: 'ok', result: { ...result, discoveredTopics: inserted }, newTopicsAdded: inserted.length };
}

export interface AdminTopicActivitySummary {
  id: string;
  userEmail: string | null;
  title: string;
  category: string;
  status: UserTopicStatus;
  source: UserTopicSource;
  nextReviewAt: string | null;
  updatedAt: string;
}

export async function listRecentActivityForAdmin(limit: number): Promise<AdminTopicActivitySummary[]> {
  const rows = await repoListRecentActivityForAdmin(limit);
  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    title: row.title,
    category: row.category,
    status: row.status,
    source: row.source,
    nextReviewAt: row.next_review_at ? row.next_review_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  }));
}
