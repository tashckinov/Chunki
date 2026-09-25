import type { CEFRLevel, ExercisesGradeResult, PlacementGradeResult, TopicCategory } from '@app/shared';
import { getJson, postJson } from './collections';

export interface UserTopicSummary {
  id: string;
  key: string;
  title: string;
  category: TopicCategory;
  rationale: string;
  source: 'placement' | 'discovered';
  status: 'assigned' | 'passed_once' | 'mastered';
  nextReviewAt: string | null;
  masteredAt: string | null;
}

export type ProgramState = { status: 'none' } | { status: 'active'; topics: UserTopicSummary[] };

export async function fetchProgram(): Promise<ProgramState> {
  return getJson('/api/program');
}

export interface PlacementTestInput {
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  purpose: string[];
  mcqAnswers: Record<number, string>;
  open9: string;
  open10: string;
  essay: string;
}

export async function submitPlacementTest(input: PlacementTestInput): Promise<{ result: PlacementGradeResult; topics: UserTopicSummary[] }> {
  return postJson('/api/program/placement-test', input);
}

export interface TopicStudy {
  explanation: string;
  keyPoints: string[];
  contrastExamples: { wrong: string; right: string }[];
  exampleChunks: string[];
}

export async function fetchTopicStudy(userTopicId: string): Promise<TopicStudy> {
  const data = await getJson<{ study: TopicStudy }>(`/api/program/topics/${userTopicId}/study`);
  return data.study;
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
