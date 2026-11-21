import { ArrowRight, Clock, Layers3 } from 'lucide-react';
import { DAILY_CARD_GOALS, type DailyCardGoal } from '@app/shared';
import { Logo } from '../components/brand/Logo';
import { Button } from '../components/ui/Button';
import { useStudyGoalForm } from '../components/ui/StudyGoalForm';

const WEEK = [
  { label: 'Пн', name: 'Понедельник' },
  { label: 'Вт', name: 'Вторник' },
  { label: 'Ср', name: 'Среда' },
  { label: 'Чт', name: 'Четверг' },
  { label: 'Пт', name: 'Пятница' },
  { label: 'Сб', name: 'Суббота' },
  { label: 'Вс', name: 'Воскресенье' },
];
const STUDY_DAYS = 5;
const MAX_WEEKLY = DAILY_CARD_GOALS[DAILY_CARD_GOALS.length - 1] * STUDY_DAYS;

function WeekPreview({ goal }: { goal: DailyCardGoal }) {
  return (
    <section aria-labelledby="study-week-title" className="rounded-[28px] border border-border bg-surface p-5 sm:p-8 shadow-[var(--shadow-md)]">
      <h2 id="study-week-title" className="text-section-title">Ваша неделя</h2>
      <p className="mt-1 text-body-secondary">Накопительный план на 5 дней занятий</p>
      <div className="mt-5 grid grid-cols-2 gap-3" aria-live="polite">
        <div className="rounded-2xl bg-accent-subtle p-3 sm:p-4">
          <Clock size={17} className="text-accent" aria-hidden="true" />
          <div className="mt-1.5 text-[clamp(1.3rem,4vw,1.75rem)] font-semibold tabular-nums">{goal}–{goal * 2}</div>
          <div className="text-meta">минут в учебный день</div>
        </div>
        <div className="rounded-2xl bg-surface-subtle p-3 sm:p-4">
          <Layers3 size={17} className="text-accent" aria-hidden="true" />
          <div className="mt-1.5 text-[clamp(1.3rem,4vw,1.75rem)] font-semibold tabular-nums">до {goal * STUDY_DAYS}</div>
          <div className="text-meta">фраз за неделю</div>
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2.5" aria-label="Фраз по плану к концу каждого дня">
        {WEEK.map(({ label, name }, index) => {
          const rest = index >= STUDY_DAYS;
          const total = Math.min(index + 1, STUDY_DAYS) * goal;
          return (
            <li key={label} className="min-w-0 text-center">
              <span className="sr-only">{name}: {rest ? 'отдых, ' : ''}{total} по плану</span>
              <div aria-hidden="true" className="relative flex h-26 items-end justify-center rounded-lg bg-surface-subtle sm:h-36">
                <div
                  className={`flex w-full items-start justify-center rounded-lg pt-0.5 text-[10px] font-semibold tabular-nums sm:pt-1 sm:text-xs motion-safe:transition-[height] motion-safe:duration-300 ${rest ? 'border border-dashed border-border-strong text-text-secondary' : 'bg-accent text-on-accent'}`}
                  style={{ height: `max(1.15rem, ${100 * total / MAX_WEEKLY}%)` }}
                >
                  {rest ? '—' : total}
                </div>
              </div>
              <span aria-hidden="true" className="mt-1.5 block text-meta">{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-meta">Суббота и воскресенье — отдых. Чтобы запомнить фразы, часть из них нужно будет повторить.</p>
    </section>
  );
}

export function StudyGoalScreen() {
  const { goal, setGoal, saving, error, submit } = useStudyGoalForm(DAILY_CARD_GOALS[0]);

  return (
    <main className="h-dvh overflow-y-auto bg-bg text-text">
      <div className="mx-auto flex min-h-full max-w-[1120px] flex-col gap-6 px-5 py-6 sm:px-10 sm:py-9 lg:gap-12">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <Logo size={31} />
          Chunki
        </div>
        <form
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="my-auto grid items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-x-12"
        >
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <h1 className="max-w-[16ch] text-[clamp(2rem,5vw,3.25rem)] leading-[1.08] font-semibold tracking-tight">
              Сколько карточек в день вы готовы учить?
            </h1>
            <fieldset disabled={saving} className="mt-5 grid grid-cols-4 gap-2 sm:mt-7">
              <legend className="sr-only">Карточек в день</legend>
              {DAILY_CARD_GOALS.map((option) => (
                <label key={option} className={`cursor-pointer rounded-2xl border px-1 py-2.5 text-center focus-within:ring-2 focus-within:ring-accent sm:py-3 ${goal === option ? 'border-accent bg-accent-subtle text-accent' : 'border-border bg-surface'}`}>
                  <input type="radio" name="daily-card-goal" className="sr-only" checked={goal === option} onChange={() => setGoal(option)} />
                  <span className="block text-2xl font-semibold tabular-nums">{option}</span>
                  <span className="block text-meta">в день</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <WeekPreview goal={goal ?? DAILY_CARD_GOALS[0]} />
          </div>
          <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2 lg:self-start">
            {error && <p role="alert" className="text-negative">Не удалось сохранить цель. Попробуйте ещё раз.</p>}
            <Button type="submit" size="lg" disabled={saving} className="w-full">
              {saving ? 'Сохраняем…' : 'Сохранить цель'}
              {!saving && <ArrowRight size={19} aria-hidden="true" />}
            </Button>
            <p className="text-meta">Цель можно изменить в профиле. В течение дня можно пройти несколько сессий.</p>
          </div>
        </form>
      </div>
    </main>
  );
}
