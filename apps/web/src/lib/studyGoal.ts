import type { DailyCardGoal, StudyGoalStatus } from '@app/shared';
import { getJson, postJson } from './collections';

export function fetchStudyGoal(): Promise<StudyGoalStatus> {
  return getJson('/api/progress/study-goal');
}

export function postStudyIntro(): Promise<{ ok: true }> {
  return postJson('/api/progress/study-intro', {});
}

export function postStudyGoal(goal: DailyCardGoal): Promise<StudyGoalStatus> {
  return postJson('/api/progress/study-goal', { goal });
}
