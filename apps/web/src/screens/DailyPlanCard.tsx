import { dailyPlanSteps } from '../lib/dailyPlanSteps';
import { Check, ChevronRight, CircleCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/appStore';
import type { DailyLearningPlan } from '../lib/program';

export function DailyPlanCard({ plan }: { plan: DailyLearningPlan }) {
  const steps = dailyPlanSteps(plan);
  const nextIndex = steps.findIndex(({ done }) => !done);
  const next = steps[nextIndex];
  const completed = steps.filter(({ done }) => done).length;

  return (
    <section className="rounded-2xl border border-border p-4 sm:p-5">
      {next ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section-title">На сегодня</h2>
            <p className="text-meta">Выполнено {completed} из {steps.length}</p>
          </div>
          <ol className="my-2 list-none divide-y divide-border" aria-label="Шаги занятия" role="list">
            {steps.map(({ topic, stage, title, done }, index) => (
              <li key={`${topic.id}:${stage}`} aria-current={index === nextIndex ? 'step' : undefined}
                className="flex items-center gap-3 py-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ${index === nextIndex ? 'bg-accent-subtle text-accent' : 'bg-surface-subtle text-text-secondary'}`}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-meta wrap-anywhere">{topic.title}</p>
                </div>
                {done && <><span className="sr-only">Выполнено</span><Check size={17} className="shrink-0 text-accent" aria-hidden="true" /></>}
              </li>
            ))}
          </ol>
          <Button className="w-full" onClick={() => {
            const state = useAppStore.getState();
            if (!state.user) return;
            void state.openTopic(next.topic.id, 'study', {
              plan, userId: state.user.id, origin: state.screen === 'home' ? 'home' : 'program',
            });
          }}>
            {completed > 0 ? 'Продолжить занятие' : 'Начать занятие'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 pb-3">
            <CircleCheck size={22} className="shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-section-title">На сегодня всё!</h2>
              <p className="text-meta">Следующее занятие будет доступно завтра.</p>
            </div>
          </div>
          <button type="button" className="pressable flex min-h-11 w-full items-center justify-between gap-2 border-t border-border pt-2 text-left text-sm font-medium"
            onClick={() => useAppStore.setState({ screen: 'program', grammarView: 'independent' })}>
            Продолжить самостоятельно <ChevronRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </section>
  );
}
