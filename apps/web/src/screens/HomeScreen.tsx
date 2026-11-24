import { BookOpen, CalendarClock, ChevronRight, Layers } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useLearningProgram } from '../lib/useLearningProgram';
import { useAppStore } from '../store/appStore';

const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

export function HomeScreen() {
  const { go, openTopic, placementOverview, user, testDraftOwner, testVariant, testStarting, testStartError, startTest } = useAppStore();
  const { topics, latest, phase, retryLoading, goal, mastered, pending, now, due, next } = useLearningProgram();
  const today = due[0] ?? next;
  const reviews = pending.flatMap((topic) => {
    const time = topic.nextReviewAt ? Date.parse(topic.nextReviewAt) : NaN;
    return Number.isFinite(time) ? [{ topic, time }] : [];
  }).sort((a, b) => a.time - b.time);
  const quota = placementOverview?.quota;
  const hasDraft = !!user && testDraftOwner === user.id && !!testVariant;
  const placementBlocked = quota?.allowed === false || (quota?.limit != null && quota.used >= quota.limit);

  return (
    <div className="scroll-clean min-h-0 flex-1">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-8 pt-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-page-title">Главная</h1>
          {latest && <span className="rounded-full bg-accent-subtle px-3 py-1 text-sm font-semibold text-accent">Уровень {latest.level}</span>}
        </header>
        <section className="space-y-3 rounded-2xl bg-accent-subtle p-5">
          <h2 className="text-section-title">Что изучать сегодня</h2>
          {today ? (
            <>
              <p className="text-meta">{due.length ? 'Повторение' : 'Следующая тема'}{today.level ? ' · ' + today.level : ''}</p>
              <h3 className="text-xl font-semibold wrap-anywhere">{today.title}</h3>
              <Button onClick={() => void openTopic(today.id)}>{due.length ? 'Начать повторение' : 'Открыть тему'}</Button>
            </>
          ) : phase === 'error' ? (
            <>
              <p role="alert" className="text-body-secondary">Не удалось загрузить программу.</p>
              <Button onClick={retryLoading}>Повторить загрузку</Button>
            </>
          ) : phase !== 'ready' ? (
            <p role="status" className="text-body-secondary">{phase === 'building' ? 'Собираем персональную программу…' : 'Загружаем план занятий…'}</p>
          ) : !latest && (!placementBlocked || hasDraft) ? (
            <>
              <p className="text-body-secondary">Пройдите короткий тест. Chunki подберёт темы под ваш уровень и составит персональную программу.</p>
              <Button disabled={testStarting} onClick={() => { if (hasDraft) void startTest(); else go('goals'); }}>
                {hasDraft ? 'Продолжить тест' : 'Определить уровень'}
              </Button>
              {testStartError && <p role="alert" className="text-negative text-sm">{testStartError}</p>}
            </>
          ) : (
            <>
              <p className="text-body-secondary">{latest ? 'На сегодня учебных тем нет. Можно потренировать выражения по карточкам.' : 'Сейчас тест уровня недоступен. Начать занятия можно с карточек.'}</p>
              <Button onClick={() => go('cardslib')}>Открыть карточки</Button>
            </>
          )}
        </section>

        {latest && (
          <section className="space-y-2 border-b border-border pb-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section-title">На пути к {goal}</h2>
              <span className="text-meta">{mastered} из {topics.length} подтверждено</span>
            </div>
            <progress aria-label="Подтверждено тем" max={Math.max(1, topics.length)} value={mastered}
              className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" />
            {due.length > 0 && next && <p className="text-meta">Следующая новая тема · {next.title}</p>}
          </section>
        )}

        {reviews.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-section-title">Повторения</h2>
            <ul className="divide-y divide-border">
              {reviews.slice(0, 3).map(({ topic, time }) => (
                <li key={topic.id} className="flex items-center gap-3 py-2.5">
                  <CalendarClock className="shrink-0 text-accent" size={17} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm wrap-anywhere">{topic.title}</span>
                  <span className="shrink-0 text-meta">{time <= now ? 'Пора повторить' : date.format(time)}</span>
                </li>
              ))}
            </ul>
            {reviews.length > 3 && <Button size="sm" variant="ghost" onClick={() => go('program')}>Открыть программу</Button>}
          </section>
        )}

        <section className="border-t border-border">
          {([['cardslib', 'Карточки', Layers], ['comics', 'Комиксы', BookOpen]] as const).map(([screen, title, Icon]) => (
            <button key={screen} type="button" className="pressable flex min-h-12 w-full items-center gap-3 border-b border-border py-3 text-left"
              onClick={() => go(screen)}>
              <Icon size={17} className="text-accent" aria-hidden="true" />
              <span className="flex-1 font-medium">{title}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}
