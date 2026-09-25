import type { ExerciseItem, ExercisesGradeResult, PlacementGradeResult, PlacementTestSubmission, TopicStudyContent, TopicSuggestion } from '@app/shared';
import { getGradingProvider } from '../../grading/index.js';
import { withAiCallLogging } from '../aiLogs/service.js';
import {
  createAttempt,
  createPlacementTest,
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

export type ProgramForUser = { status: 'none' } | { status: 'active'; topics: UserTopicSummary[] };

export async function getProgramForUser(userId: string): Promise<ProgramForUser> {
  const rows = await findUserTopics(userId);
  if (rows.length === 0) return { status: 'none' };
  return { status: 'active', topics: rows.map(toSummary) };
}

export async function submitPlacementTest(userId: string, input: PlacementTestSubmission): Promise<{ result: PlacementGradeResult; topics: UserTopicSummary[] }> {
  const provider = getGradingProvider();
  const result = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: null, request: input }, () => provider.gradePlacementTest(input));

  await createPlacementTest({
    userId,
    fromLevel: input.fromLevel,
    toLevel: input.toLevel,
    purpose: input.purpose,
    mcqAnswers: input.mcqAnswers,
    open9: input.open9,
    open10: input.open10,
    essay: input.essay,
    overallLevel: result.overallLevel,
    skills: result.skills,
    aboveLevel: result.aboveLevel,
    belowLevel: result.belowLevel,
    mcqScore: result.mcqScore,
    openGrades: result.openGrades,
    essayGrade: result.essayGrade,
  });

  await insertNewUserTopics(userId, result.topics, 'placement');
  const topics = (await findUserTopics(userId)).map(toSummary);
  return { result, topics };
}

export type TopicStudyResult = { kind: 'not_found' } | { kind: 'ok'; study: TopicStudyContent };

export async function getTopicStudy(userId: string, userTopicId: string): Promise<TopicStudyResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };
  if (row.study_content) return { kind: 'ok', study: row.study_content as TopicStudyContent };

  const provider = getGradingProvider();
  const topic = toTopicSuggestion(row);
  const study = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: null, request: topic }, () => provider.generateTopicStudy(topic));

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
  | { kind: 'ok'; attemptId: string; attemptKind: TopicAttemptKind; items: RedactedExerciseItem[] };

export async function startTopicAttempt(userId: string, userTopicId: string): Promise<StartAttemptResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };
  if (row.status === 'mastered') return { kind: 'already_mastered' };

  const attemptKind: TopicAttemptKind = row.status === 'passed_once' ? 'reconfirm' : 'initial';
  if (attemptKind === 'reconfirm' && row.next_review_at && row.next_review_at.getTime() > Date.now()) {
    return { kind: 'not_due' };
  }

  const provider = getGradingProvider();
  const topic = toTopicSuggestion(row);
  const items = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: null, request: topic }, () => provider.generateTopicExercises(topic));

  const attempt = await createAttempt(row.id, attemptKind, items);
  return { kind: 'ok', attemptId: attempt.id, attemptKind, items: redact(items) };
}

export type SubmitAttemptResult =
  | { kind: 'not_found' }
  | { kind: 'attempt_not_found' }
  | { kind: 'already_graded' }
  | { kind: 'ok'; result: ExercisesGradeResult; newTopicsAdded: number };

export async function submitTopicAttempt(userId: string, userTopicId: string, attemptId: string, answers: Record<number, string>): Promise<SubmitAttemptResult> {
  const row = await findUserTopic(userId, userTopicId);
  if (!row) return { kind: 'not_found' };

  const attempt = await findAttempt(attemptId);
  if (!attempt || attempt.user_topic_id !== row.id) return { kind: 'attempt_not_found' };
  if (attempt.graded_at) return { kind: 'already_graded' };

  const items = attempt.items as ExerciseItem[];
  const topic = toTopicSuggestion(row);
  const gradeInput = { topic, items, answers };

  const provider = getGradingProvider();
  const result = await withAiCallLogging({ userId, chunkId: null, provider: provider.name, model: null, request: gradeInput }, () => provider.gradeExercises(gradeInput));

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
