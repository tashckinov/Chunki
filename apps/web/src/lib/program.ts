import type { CEFRLevel, ExercisesGradeResult, PlacementGradeResult, PlacementOverview, PlacementResultSummary, PlacementTestSubmission, PlacementTestVariant, TopicCategory, TopicStudyContent } from '@app/shared';
import { requestTopicLevelStudy } from './topicLevelStudy';
import { getJson, postJson } from './collections';

export interface UserTopicSummary {
  id: string;
  key: string;
  title: string;
  category: TopicCategory;
  level: CEFRLevel | null;
  topicNumber?: number | null;
  rationale: string;
  source: 'placement' | 'discovered';
  status: 'assigned' | 'passed_once' | 'mastered';
  nextReviewAt: string | null;
  masteredAt: string | null;
}

export type ProgramState = ({ status: 'none' } | { status: 'active'; topics: UserTopicSummary[] }) & { placement?: PlacementOverview; needsProgramBuild?: boolean };

export async function fetchProgram(): Promise<ProgramState> {
  return getJson('/api/program');
}

export function rebuildProgram(): Promise<{ status: 'ready' | 'building' }> {
  return postJson('/api/program/rebuild', {});
}

export function fetchPlacementResult(id: string): Promise<{ summary: PlacementResultSummary; result: PlacementGradeResult }> {
  return getJson(`/api/program/placement-results/${encodeURIComponent(id)}`);
}

export function fetchPlacementVariant(previous?: string): Promise<PlacementTestVariant> {
  const query = previous ? `?previous=${encodeURIComponent(previous)}` : '';
  return getJson(`/api/program/placement-variant${query}`);
}

export async function submitPlacementTest(input: PlacementTestSubmission): Promise<{ result: PlacementGradeResult; topics: UserTopicSummary[] }> {
  return postJson('/api/program/placement-test', input);
}

export type TopicStudy = TopicStudyContent;

export async function fetchTopicStudy(userTopicId: string): Promise<TopicStudy> {
  const data = await getJson<{ study: TopicStudy }>(`/api/program/topics/${userTopicId}/study`);
  return data.study;
}

export function fetchLearnerLevelStudy(userTopicId: string) {
  return requestTopicLevelStudy(`/api/program/topics/${encodeURIComponent(userTopicId)}/level-study`);
}

export type RedactedExerciseItem = { type: 'choice'; q: string; options: string[] } | { type: 'write'; q: string; rows: number; placeholder: string };

export interface TopicAttempt {
  attemptId: string;
  attemptKind: 'initial' | 'reconfirm';
  items: RedactedExerciseItem[];
}

export async function startTopicAttempt(userTopicId: string): Promise<TopicAttempt> {
  return postJson(`/api/program/topics/${userTopicId}/attempts`, {});
}

export async function submitTopicAttempt(userTopicId: string, attemptId: string, answers: Record<number, string>): Promise<{ result: ExercisesGradeResult; newTopicsAdded: number }> {
  return postJson(`/api/program/topics/${userTopicId}/attempts/${attemptId}/submit`, { answers });
}
