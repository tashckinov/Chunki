import { CEFR_LEVELS } from '@app/shared';
import { rebuildProgram } from '../lib/program';
import { useEffect, useState } from 'react';
import { BookOpen, CalendarClock, Check, ChevronLeft, ChevronRight, Clock, List, MessageCircle } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/Button';
import { LearningCatalog } from './LearningCatalog';
import type { UserTopicSummary } from '../lib/program';

const SHORT_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PLURAL = new Intl.PluralRules('ru');

function topicCount(count: number) {
  const form = PLURAL.select(count);
  return count + (form === 'one' ? ' тема' : form === 'few' ? ' темы' : ' тем');
}

const RESULT_DATE = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });
const RESET_DATE = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' });

function GrammarLevelCard() {
  const { user, placementOverview, startTest, go, testVariant, testDraftOwner, testStarting, testStartError, openPlacementResult } = useAppStore();
  const { history = [], quota } = placementOverview ?? {};
  const latest = history[0];
  const hasDraft = !!user && !!testVariant && testDraftOwner === user.id;
  const remaining = quota?.limit == null ? null : Math.max(0, quota.limit - quota.used);
  const unavailable = quota?.allowed === false || quota?.limit === 0;
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openResult(id: string) {
    setOpeningId(id);
    setError(null);
    try {
      await openPlacementResult(id);
    } catch {
      setError('Не удалось загрузить результат. Попробуйте ещё раз.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      <section aria-label="Текущий уровень" className="border-b border-border pb-5">
        <div className="py-5 text-center">
          <div className="text-4xl font-semibold text-accent">{latest?.level ?? 'Ещё не определён'}</div>
          <p className="text-meta mt-1">Текущий уровень английского</p>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {LEVELS.map((level, index) => (
            <div key={level} className="text-center text-meta">
              <div className={'mb-1 h-1 rounded-full ' + (latest && index <= LEVELS.indexOf(latest.level.replace('+', '')) ? 'bg-accent' : 'bg-border')} />
              {level}
            </div>
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          disabled={!user || testStarting || !!openingId || (!hasDraft && (unavailable || remaining === 0))}
          onClick={() => { if (latest || hasDraft) void startTest(); else go('goals'); }}
        >
          {testStarting ? 'Загружаем тест…' : hasDraft ? 'Продолжить тест' : latest ? 'Перепройти тест' : 'Пройти тест'}
        </Button>
        {quota && (
          <div className="mt-3 text-center text-meta">
            {unavailable ? 'Тест уровня недоступен на вашем тарифе.'
              : remaining === null ? 'Тесты уровня без месячного лимита.'
              : `Осталось проверок в этом месяце: ${remaining} из ${quota.limit}. Обновится ${RESET_DATE.format(new Date(quota.resetsAt))}.`}
          </div>
        )}
        {testStartError && <p role="alert" className="mt-2 text-negative">{testStartError}</p>}
      </section>
      {history.length > 0 && (
        <section aria-label="Результаты тестов" className="pt-3">
          <h2 className="text-section-title pt-3 pb-1">История тестирования</h2>
          {history.map(({ id, level, completedAt }) => (
            <button key={id} type="button" disabled={!!openingId || testStarting} onClick={() => void openResult(id)}
              className="flex w-full min-h-11 items-center gap-2 border-b border-border py-2 text-left last:border-b-0 disabled:opacity-60">
              <span className="font-semibold">{level}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{RESULT_DATE.format(new Date(completedAt))}</span>
                <span className="block text-meta">{openingId === id ? 'Загружаем…' : 'Смотреть результат'}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
          {error && <p role="alert" className="pb-3 text-negative">{error}</p>}
        </section>
      )}
    </div>
  );
}

export function ProgramScreen() {
  const s = useAppStore();
  const current = s.learningTopic?.userId === s.user?.id
    ? s.programTopics.find(({ id, status }) => id === s.learningTopic?.topicId && status === 'assigned')
    : undefined;
  const difficulty = ({ level }: UserTopicSummary) => level ? CEFR_LEVELS.indexOf(level) : CEFR_LEVELS.length;
  const topics = current
    ? [...s.programTopics.filter(({ status }) => status !== 'assigned'), current,
      ...s.programTopics.filter((topic) => topic.status === 'assigned' && topic.id !== current.id)
        .sort((a, b) => difficulty(a) - difficulty(b))]
    : s.programTopics;
  const userId = s.user?.id;
  const [phase, setPhase] = useState<'loading' | 'building' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const { loadProgram } = useAppStore.getState();

    async function prepare() {
      setPhase('loading');
      try {
        const current = await loadProgram();
        if (!active) return;
        if (!current) throw new Error('Program unavailable');
        if (current.needsProgramBuild) {
          setPhase('building');
          const { status } = await rebuildProgram();
          if (!active) return;
          if (status === 'building') {
            // Another tab or a previous visit already holds the build lease.
            for (let attempt = 0; attempt < 30 && active; attempt += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 1500));
              if (!active) return;
              const updated = await loadProgram();
              if (updated && !updated.needsProgramBuild) break;
              if (attempt === 29) throw new Error('Program build pending');
            }
          } else {
            const updated = await loadProgram();
            if (!updated || updated.needsProgramBuild) throw new Error('Program build pending');
          }
        }
        if (active) setPhase('ready');
      } catch {
        if (active) setPhase('error');
      }
    }

    void prepare();
    return () => { active = false; };
  }, [retry, userId]);
  const latest = s.placementOverview?.history[0];
  const goal = latest?.goal ?? s.to;
  const mastered = topics.filter((topic) => topic.status === 'mastered').length;
  const pending = topics.filter((topic) => topic.status === 'passed_once');
  const now = Date.now();
  const due = pending.find((topic) => topic.nextReviewAt && Date.parse(topic.nextReviewAt) <= now);
  const today = due ?? topics.find((topic) => topic.status === 'assigned');
  const reviewGroups = new Map<string, UserTopicSummary[]>();
  const scheduled = pending.flatMap((topic) => {
    const time = topic.nextReviewAt ? Date.parse(topic.nextReviewAt) : NaN;
    return time > now ? [{ topic, time }] : [];
  }).sort((a, b) => a.time - b.time);
  for (const { topic, time } of scheduled) {
    const date = SHORT_DATE.format(time);
    reviewGroups.set(date, [...(reviewGroups.get(date) ?? []), topic]);
  }
  const view = s.grammarView;
  const selectView = (grammarView: typeof view) => useAppStore.setState({ grammarView });

  const notice = phase === 'error' ? (
    <div className="space-y-2">
      <p role="alert" className="text-negative">Не удалось загрузить программу.</p>
      <Button size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>
    </div>
  ) : userId && (phase === 'building' || phase === 'loading') ? (
    <p role="status" className="text-meta">{phase === 'building' ? 'Собираем программу по последнему тесту…' : 'Загружаем программу…'}</p>
  ) : null;

  return (
    <div key={view} className="scroll-clean flex-1 min-h-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pb-6 pt-4">
        {view !== 'overview' && (
          <button type="button" className="flex min-h-9 items-center gap-1 self-start text-sm text-accent"
            onClick={() => selectView('overview')}><ChevronLeft size={16} aria-hidden="true" /> Обучение</button>
        )}
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-page-title">{view === 'overview' ? 'Обучение' : view === 'level' ? 'Мой уровень' : 'Моя программа'}</h1>
          {view === 'overview' && (
            <Button size="sm" variant="secondary" className="bg-accent-subtle text-accent" onClick={() => selectView('level')}>
              {latest?.level ?? 'Мой уровень'} <ChevronRight size={14} aria-hidden="true" />
            </Button>
          )}
        </header>
        {view === 'level' && <GrammarLevelCard />}
        {view === 'overview' && !latest && (
          !userId || s.placementOverview || phase === 'ready'
            ? <LearningCatalog />
            : notice
        )}
        {view === 'overview' && latest && (
          <>
            {latest && (
              <section className="space-y-1.5 border-b border-border pb-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">На пути к {goal}</h2>
                  <span className="text-meta">{mastered} из {topics.length}</span>
                </div>
                <progress aria-label="Подтверждено тем" max={Math.max(topics.length, 1)} value={mastered}
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" />
                {pending.length > 0 && <p className="text-meta">Ожидают проверки · {topicCount(pending.length)}</p>}
              </section>
            )}
            <section className="space-y-3">
              <div>
                <h2 className="text-section-title">На сегодня</h2>
                <p className="text-meta">{SHORT_DATE.format(new Date())}{today && (due ? ' · Около 5–10 минут' : ' · Около 15 минут')}</p>
              </div>
              {today ? (
                <div className="space-y-3 rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent">
                      {due ? <Clock size={17} aria-hidden="true" /> : <BookOpen size={17} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{due ? 'Повторение' : 'Новая тема'}</p>
                      <p className="text-meta wrap-anywhere">{today.title}</p>
                    </div>
                  </div>
                  {!due && (
                    <div className="flex items-center gap-3 border-t border-border pt-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent"><MessageCircle size={17} aria-hidden="true" /></span>
                      <div><p className="text-sm font-semibold">Практика</p><p className="text-meta">Упражнения по новой теме</p></div>
                    </div>
                  )}
                  <Button className="w-full" onClick={() => void s.openTopic(today.id)}>{due ? 'Начать повторение' : 'Начать обучение'}</Button>
                </div>
              ) : !notice && (
                <p className="text-body-secondary">На сегодня тем к изучению и повторению нет.</p>
              )}
              {notice}
            </section>
            {reviewGroups.size > 0 && (
              <section className="border-b border-border pb-3">
                <h2 className="text-section-title">Ближайшие повторения</h2>
                {[...reviewGroups].slice(0, 3).map(([date, group]) => (
                  <div key={date} className="flex items-center gap-2 py-3">
                    <CalendarClock size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{date}</p>
                      <p className="text-meta wrap-anywhere">{group.map(({ title }) => title).join(' · ')}</p>
                    </div>
                    <span className="shrink-0 text-meta">{topicCount(group.length)}</span>
                  </div>
                ))}
              </section>
            )}
            <button type="button" onClick={() => selectView('topics')}
              className="pressable flex w-full items-center gap-3 border-b border-border py-4 text-left">
              <List size={18} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="flex-1"><span className="block font-medium">Моя программа</span><span className="block text-meta">{topicCount(topics.length)} · прогресс по темам</span></span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </>
        )}
        {view === 'topics' && (
          <section>
            <p className="text-meta">{latest && latest.level + ' → ' + goal + ' · '}{mastered} из {topics.length} подтверждено</p>
            {topics.map((topic) => {
              const isToday = topic.id === today?.id;
              const review = topic.nextReviewAt ? new Date(topic.nextReviewAt) : null;
              const status = topic.status === 'mastered' ? 'Подтверждено' :
                topic.status === 'passed_once' ? review && review.getTime() <= now ? 'Можно повторить'
                  : review ? 'Проверка ' + SHORT_DATE.format(review) : 'Ожидает проверки'
                  : isToday ? 'Сегодня' : 'Предстоит изучить';
              return (
                <button key={topic.id} type="button" onClick={() => void s.openTopic(topic.id, 'read')}
                  className="pressable flex w-full items-center gap-3 border-b border-border py-4 text-left">
                  <span className="grid size-5 shrink-0 place-items-center text-accent">
                    {topic.status === 'mastered' ? <Check size={16} aria-hidden="true" /> :
                      topic.status === 'passed_once' ? <Clock size={16} aria-hidden="true" /> :
                      isToday ? <BookOpen size={16} aria-hidden="true" /> : <span className="size-2.5 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium wrap-anywhere">{topic.title}</span>
                    <span className="block text-meta">{[topic.level, status, topic.topicNumber != null && 'CEFR №' + topic.topicNumber].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                </button>
              );
            })}
            {notice ?? (topics.length === 0 && <p className="py-3 text-meta">Тем пока нет.</p>)}
          </section>
        )}
      </div>
    </div>
  );
}
