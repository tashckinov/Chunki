import { rebuildProgram } from '../lib/program';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { daysUntil } from '../lib/schedule';
import { Button } from '../components/ui/Button';
import { NavigationBar } from '../components/ui/NavigationBar';

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
  const [showHistory, setShowHistory] = useState(false);
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
      <section aria-label="Текущий уровень" className="rounded-[var(--radius-lg)] bg-accent-subtle p-4">
        <h2 className="text-meta">Текущий уровень</h2>
        <div className="mt-1 text-2xl font-semibold">{latest?.level ?? 'Ещё не определён'}</div>
        {quota && (
          <div className="mt-2 text-body-secondary">
            {unavailable ? 'Тест уровня недоступен на вашем тарифе.'
              : remaining === null ? 'Тесты уровня без месячного лимита.'
              : `Осталось проверок в этом месяце: ${remaining} из ${quota.limit}. Обновится ${RESET_DATE.format(new Date(quota.resetsAt))}.`}
          </div>
        )}
        <Button
          className="mt-4 w-full"
          disabled={!user || testStarting || !!openingId || (!hasDraft && (unavailable || remaining === 0))}
          onClick={() => { if (latest || hasDraft) void startTest(); else go('goals'); }}
        >
          {testStarting ? 'Загружаем тест…' : hasDraft ? 'Продолжить тест' : latest ? 'Перепройти тест' : 'Пройти тест'}
        </Button>
        {testStartError && <p role="alert" className="mt-2 text-negative">{testStartError}</p>}
      </section>
      {history.length > 0 && (
        <section aria-label="Результаты тестов" className="rounded-[var(--radius-md)] border border-border px-4">
          <h2 className="text-section-title pt-3 pb-1">Результаты тестов</h2>
          {(showHistory ? history : history.slice(0, 1)).map(({ id, level, completedAt }) => (
            <button key={id} type="button" disabled={!!openingId || testStarting} onClick={() => void openResult(id)}
              className="flex w-full min-h-11 items-center gap-2 border-b border-border py-2 text-left last:border-b-0 disabled:opacity-60">
              <span className="font-semibold">{level}</span>
              <span className="flex-1 text-body-secondary">{RESULT_DATE.format(new Date(completedAt))}</span>
              <span className="text-sm text-accent">{openingId === id ? 'Загружаем…' : 'Смотреть результат'}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
          {history.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory((value) => !value)} className="mb-2">
              {showHistory ? 'Свернуть историю' : 'Предыдущие результаты'}
            </Button>
          )}
          {error && <p role="alert" className="pb-3 text-negative">{error}</p>}
        </section>
      )}
    </div>
  );
}

export function ProgramScreen() {
  const s = useAppStore();
  const topics = s.programTopics;
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
  const masteredCount = topics.filter((t) => t.status === 'mastered').length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Грамматика" />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col">
        <GrammarLevelCard />
        <h2 className="text-section-title mb-1">Программа до {s.placementOverview?.history[0]?.goal ?? s.to}</h2>
        <div className="text-body-secondary mb-2">
          {topics.length} {topics.length === 1 ? 'тема' : 'тем'} · {masteredCount} подтверждено
        </div>
        {topics.map((topic) => {
          const due = topic.status === 'passed_once' && topic.nextReviewAt && new Date(topic.nextReviewAt).getTime() <= Date.now();
          const waiting = topic.status === 'passed_once' && !due;
          const dotBg = topic.status === 'mastered' ? 'var(--color-accent)' : due ? 'var(--color-warning-subtle)' : 'var(--color-surface-subtle)';
          const dotFg = topic.status === 'mastered' ? 'var(--color-on-accent)' : 'var(--color-text-secondary)';

          let meta: string = topic.category;
          if (topic.status === 'assigned') meta = `${topic.category} · Изучить`;
          else if (waiting && topic.nextReviewAt) meta = `${topic.category} · Проверка через ${daysUntil(topic.nextReviewAt)} дн.`;
          else if (due) meta = `${topic.category} · Готово к переподтверждению`;
          else if (topic.status === 'mastered') meta = `${topic.category} · Подтверждено`;

          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => void s.openTopic(topic.id)}
              className="pressable flex gap-3.5 py-3.5 border-b border-border last:border-b-0 text-left"
            >
              <div className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-[12px] font-medium mt-0.5" style={{ background: dotBg, color: dotFg }}>
                {topic.status === 'mastered' ? '✓' : '·'}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[15.5px] leading-[22px]">{topic.title}</div>
                  {topic.topicNumber != null && <span className="text-meta">CEFR №{topic.topicNumber}</span>}
                  {topic.level && <span className="text-meta">{topic.level}</span>}
                  {topic.source === 'discovered' && <span className="text-[11px] font-medium text-accent rounded-full bg-accent-subtle px-2 py-0.5">найдено ИИ</span>}
                </div>
                <div className="text-meta mt-0.5">{meta}</div>
              </div>
            </button>
          );
        })}
        {topics.length === 0 && phase === 'loading' && <p role="status" className="text-body-secondary py-2">Загружаем программу…</p>}
        {phase === 'building' && <p role="status" className="text-body-secondary py-2">Собираем программу по последнему тесту…</p>}
        {phase === 'error' && <div className="py-2">
          <p role="alert" className="text-negative mb-2">Не удалось загрузить программу. Результаты теста сохранены.</p>
          <Button size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>
        </div>}
        {topics.length === 0 && phase === 'ready' && <div className="text-body-secondary py-2">
          {s.placementOverview?.history.length && s.placementOverview.quota.allowed
            ? 'В каталоге пока нет тем для этого диапазона уровней.'
            : 'Тем пока нет.'}
        </div>}
      </div>
    </div>
  );
}
