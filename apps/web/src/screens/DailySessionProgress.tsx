import { useAppStore } from '../store/appStore';

export function DailySessionProgress() {
  const { dailySession, activeTopicId, screen, checkingContext, exerciseResult, user } = useAppStore();
  if (!dailySession || dailySession.userId !== user?.id ||
      !(['topic', 'exercises', 'topicresult'].includes(screen) || (screen === 'checking' && checkingContext === 'exercise'))) return null;

  const steps = dailySession.plan.steps.flatMap(({ topic, kind, done }) =>
    (kind === 'new' ? ['Новая тема', 'Практика'] : ['Повторение']).map((title) => ({ title, id: topic.id, done })));
  const first = steps.findIndex(({ id }) => id === activeTopicId);
  if (first === -1) return null;
  const index = steps[first].title === 'Новая тема' && screen !== 'topic' ? first + 1 : first;
  const graded = screen === 'topicresult' && exerciseResult;
  const completed = steps.filter((step, i) => step.done ||
    (step.id === activeTopicId && (i < index || (i === index && graded)))).length;

  return <section className="flex-none border-b border-border px-5 py-3">
    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
      <span className="font-medium">{steps[index].title}</span>
      <span className="text-meta">Шаг {index + 1} из {steps.length}</span>
    </div>
    <progress aria-label="Выполнено шагов занятия" max={steps.length} value={completed}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" />
  </section>;
}
