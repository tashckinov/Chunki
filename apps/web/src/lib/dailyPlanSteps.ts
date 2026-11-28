import type { DailyLearningPlan } from './program';

const titles = {
  review: 'Повторение',
  lesson: 'Новая тема',
  practice: 'Практика',
} as const;

export function dailyPlanSteps(plan: DailyLearningPlan) {
  return plan.steps.flatMap(({ topic, kind, done }) => {
    const stages = kind === 'review' ? ['review'] as const : ['lesson', 'practice'] as const;
    return stages.map((stage) => ({ topic, stage, done, title: titles[stage] }));
  });
}
