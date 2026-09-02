import { EXTRA_TOPIC_DEFS, PROGRAM_TOPICS } from '@app/shared';
import { AlarmClock } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { CircularProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { ListRow } from '../components/ui/ListRow';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function TopicResultScreen() {
  const s = useAppStore();
  const result = s.exerciseResult;
  const topic = PROGRAM_TOPICS.find((t) => t.id === s.lastCompletedTopicId);

  if (!result || !topic) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Не получилось проверить упражнения</div>
        <div className="text-body-secondary">{s.gradingError || 'Попробуйте ещё раз.'}</div>
        <Button size="sm" onClick={s.goExercises}>
          Пройти упражнения заново
        </Button>
      </div>
    );
  }

  const reviewDate = new Date(Date.now() + result.nextReviewInDays * 86400000);
  const reviewLabel = `${reviewDate.getDate()} ${MONTHS[reviewDate.getMonth()]}`;

  const weakOffers = result.weakTopicKeys
    .map((key) => EXTRA_TOPIC_DEFS.find((e) => e.key === key))
    .filter((e): e is (typeof EXTRA_TOPIC_DEFS)[number] => !!e);

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div className="flex items-center gap-5">
        <div className="relative w-20 h-20 flex-none flex items-center justify-center">
          <CircularProgress value={result.scoreOutOf10 / 10} size={80} thickness={6} />
          <div className="absolute text-[20px] font-semibold">{result.scoreOutOf10}/10</div>
        </div>
        <div className="flex-1">
          <div className="text-[21px] font-semibold leading-7">{result.verdictLabel}</div>
          <div className="text-body-secondary mt-0.5">{topic.title}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-[14.5px] text-text-secondary">
        <AlarmClock size={17} className="text-accent flex-none" />
        <span>
          Контрольная проверка через {result.nextReviewInDays} дня — {reviewLabel}
        </span>
      </div>

      <div>
        <div className="text-section-title mb-3">По блокам</div>
        <div className="flex flex-col gap-3">
          {result.blockScores.map((b) => {
            const fraction = b.total > 0 ? b.correct / b.total : 0;
            const fg = fraction >= 0.8 ? 'var(--color-positive)' : fraction >= 0.5 ? 'var(--color-warning)' : 'var(--color-negative)';
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="flex-1 text-[15px]">{b.label}</div>
                <div className="w-24 h-1 rounded-full bg-surface-subtle overflow-hidden">
                  <div className="h-full rounded-full" style={{ background: fg, width: `${fraction * 100}%` }} />
                </div>
                <div className="w-9 text-right text-[13px] font-medium" style={{ color: fg }}>
                  {b.correct % 1 === 0 ? b.correct : b.correct.toFixed(1)}/{b.total}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {result.notes.length > 0 && (
        <div>
          <div className="text-section-title mb-3">Заметки</div>
          <div className="flex flex-col gap-2.5">
            {result.notes.map((note, i) => (
              <div key={i} className="flex gap-3 text-[15px] leading-[22px]">
                <span className="w-1 rounded-full bg-accent flex-none" />
                <div>{note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakOffers.length > 0 && (
        <div>
          <div className="text-section-title mb-1">Слабые стороны — добавить к изучению</div>
          <div>
            {weakOffers.map((w) => {
              const on = !!s.extrasEnabled[w.key];
              return (
                <ListRow
                  key={w.key}
                  title={w.title}
                  trailing={
                    <button
                      onClick={() => s.toggleExtra(w.key)}
                      className={`pressable rounded-full px-3.5 py-1.5 text-[13.5px] font-medium ${on ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-accent'}`}
                    >
                      {on ? 'Добавлено' : 'Добавить'}
                    </button>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        <Button size="lg" onClick={s.goHome} className="w-full">
          К программе
        </Button>
        <Button variant="secondary" size="sm" onClick={s.goExtras} className="w-full">
          Открыть доп. уроки
        </Button>
      </div>
    </div>
  );
}
