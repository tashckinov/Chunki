import { BookOpen, Check, ChevronRight, CircleCheck, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/appStore';
import type { DailyLearningPlan } from '../lib/program';

export function DailyPlanCard({ plan }: { plan: DailyLearningPlan }) {
  const reviews = plan.steps.filter(({ kind }) => kind === 'review');
  const lesson = plan.steps.find(({ kind }) => kind === 'new');
  const next = plan.steps.find(({ done }) => !done);
  const rows = [
    ...(reviews.length ? [{ title: 'Повторение', detail: reviews.map(({ topic }) => topic.title).join(' · '),
      Icon: RefreshCw, done: reviews.every(({ done }) => done) }] : []),
    ...(lesson ? [
      { title: 'Новая тема', detail: lesson.topic.title, Icon: BookOpen, done: lesson.done },
      { title: 'Практика', detail: 'Упражнения по новой теме', Icon: MessageCircle, done: lesson.done },
    ] : []),
  ];

  return (
    <section className="rounded-2xl border border-border p-4 sm:p-5">
      {next ? (
        <>
          <h2 className="text-section-title">На сегодня</h2>
          <ul className="my-2 divide-y divide-border">
            {rows.map(({ title, detail, Icon, done }) => (
              <li key={title} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-meta wrap-anywhere">{detail}</p>
                </div>
                {done && <span aria-label="Выполнено"><Check size={17} className="text-accent" aria-hidden="true" /></span>}
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={() => void useAppStore.getState().openTopic(next.topic.id)}>
            {plan.steps.some(({ done }) => done) ? 'Продолжить занятие' : 'Начать занятие'}
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
