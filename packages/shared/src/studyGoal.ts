export const INTRO_CHUNK_COUNT = 4;
export const DAILY_CARD_GOALS = [5, 10, 15, 20] as const;
export type DailyCardGoal = (typeof DAILY_CARD_GOALS)[number];

export interface StudyGoalStatus {
  introCompleted: boolean;
  dailyCardGoal: DailyCardGoal | null;
}
