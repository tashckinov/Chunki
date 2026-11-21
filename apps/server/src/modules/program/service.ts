import type { ExerciseItem, ExercisesGradeResult, PlacementGradeResult, PlacementOverview, PlacementQuota, PlacementResultSummary, PlacementTestSubmission, TopicStudyContent, TopicSuggestion } from '@app/shared';
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
  findAttempt,
  findUserTopic,
  findUserTopics,
  insertNewUserTopics,
  listRecentActivityForAdmin as repoListRecentActivityForAdmin,
  updateAttemptResult,
  updateTopicStatus,
  updateTopicStudyContent,
  type TopicAttemptKind,
  type UserTopicRow,
  type UserTopicSource,
  type UserTopicStatus,
} from './repository.js';
import { buildPlacementReview } from './placementReview.js';

export interface UserTopicSummary {
  id: string;
  key: string;
  title: string;
  category: string;
  rationale: string;
  source: UserTopicSource;
  status: UserTopicStatus;
  nextReviewAt: string | null;
  masteredAt: string | null;
}

function toSummary(row: UserTopicRow): UserTopicSummary {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    category: row.category,
    rationale: row.rationale,
    source: row.source,
    status: row.status,
    nextReviewAt: row.next_review_at ? row.next_review_at.toISOString() : null,
    masteredAt: row.mastered_at ? row.mastered_at.toISOString() : null,
  };
}

function toTopicSuggestion(row: UserTopicRow): TopicSuggestion {
  return { key: row.key, title: row.title, category: row.category, rationale: row.rationale };
}

export type ProgramForUser = ({ status: 'none' } | { status: 'active'; topics: UserTopicSummary[] }) & { placement: PlacementOverview };

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
  return { status: 'active', topics: topics.map(toSummary), placement };
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
        const topics = (await findUserTopics(userId)).map(toSummary);
        return { kind: 'ok', result: saved.result, topics };
      }
    }

    const access = await resolvePlacementAccess(userId);
    if (!access.allowed) return { kind: 'not_allowed', upsellTariffs: await listUpsellTariffs(access.tariffId) };
    const quota = await placementQuota(userId, access);
    if (quota.limit !== null && quota.used >= quota.limit) return { kind: 'limit_reached', quota };

    const definition = await findGrammarTest(input.variantId);
    if (!definition) return { kind: 'variant_not_found' };
    const provider = getGradingProvider();
    const grade = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: input }, () => provider.gradePlacementTest(input, definition));
    const result = { ...grade, review: buildPlacementReview(definition, input, grade) };

    await savePlacementTest({
      ...input,
      userId,
      variantId: input.variantId === 'builtin' ? undefined : input.variantId,
      overallLevel: result.overallLevel,
      skills: result.skills,
      aboveLevel: result.aboveLevel,
      belowLevel: result.belowLevel,
      mcqScore: result.mcqScore,
      openGrades: result.openGrades,
      essayGrade: result.essayGrade,
    }, result.topics, token);

    const topics = (await findUserTopics(userId)).map(toSummary);
    return { kind: 'ok', result, topics };
  } finally {
    // A stale lock expires even if the database is unavailable during cleanup.
    await releasePlacementCheck(userId, token).catch(() => {});
  }
}

export type TopicStudyResult = { kind: 'not_found' } | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] } | { kind: 'ok'; study: TopicStudyContent };

export async function getTopicStudy(userId: string, userTopicId: string): Promise<TopicStudyResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };
  if (row.study_content) return { kind: 'ok', study: row.study_content as TopicStudyContent };

  const upsellTariffs = await checkProgramAllowed(userId);
  if (upsellTariffs) return { kind: 'not_allowed', upsellTariffs };

  const provider = getGradingProvider();
  const topic = toTopicSuggestion(row);
  const study = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: topic }, () => provider.generateTopicStudy(topic));

  await updateTopicStudyContent(row.id, study);
  return { kind: 'ok', study };
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
  const topic = toTopicSuggestion(row);
  const items = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: topic }, () => provider.generateTopicExercises(topic));

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
  const topic = toTopicSuggestion(row);
  const gradeInput = { topic, items, answers };

  const provider = getGradingProvider();
  const result = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: provider.model ?? null, request: gradeInput }, () => provider.gradeExercises(gradeInput));

  await updateAttemptResult(attempt.id, { answers, scoreOutOf10: result.scoreOutOf10, passed: result.passed, notes: result.notes, discoveredTopics: result.discoveredTopics });

  const nextReviewAt = new Date(Date.now() + result.nextReviewInDays * 86400000);
  if (result.passed) {
    if (attempt.kind === 'initial') {
      await updateTopicStatus(row.id, { status: 'passed_once', passedOnceAt: new Date(), nextReviewAt, masteredAt: null });
    } else {
      await updateTopicStatus(row.id, { status: 'mastered', passedOnceAt: row.passed_once_at, nextReviewAt: null, masteredAt: new Date() });
    }
  } else {
    await updateTopicStatus(row.id, { status: 'assigned', passedOnceAt: null, nextReviewAt: null, masteredAt: null });
  }

  const inserted = await insertNewUserTopics(userId, result.discoveredTopics, 'discovered');
  return { kind: 'ok', result, newTopicsAdded: inserted.length };
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
