import { EXTRA_TOPIC_DEFS, PROGRAM_TOPICS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { Icon } from '../components/ui/Icon';
import { CircularProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

export function TopicResultScreen() {
  const s = useAppStore();
  const result = s.exerciseResult;
  const topic = PROGRAM_TOPICS.find((t) => t.id === s.lastCompletedTopicId);

  if (!result || !topic) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-lg">Не получилось проверить упражнения</div>
        <div className="text-sm text-on-surface-variant">{s.gradingError || 'Попробуйте ещё раз.'}</div>
        <Button variant="filled" size="s" onClick={s.goExercises}>
          Пройти упражнения заново
        </Button>
      </div>
    );
  }

  const reviewDate = new Date(Date.now() + result.nextReviewInDays * 86400000);
  const reviewLabel = `${reviewDate.getDate()} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][reviewDate.getMonth()]}`;

  const weakOffers = result.weakTopicKeys
    .map((key) => EXTRA_TOPIC_DEFS.find((e) => e.key === key))
    .filter((e): e is (typeof EXTRA_TOPIC_DEFS)[number] => !!e);

  return (
    <div className="scroll-clean flex-1 min-h-0 px-6 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <div className="flex items-center gap-5">
        <div className="relative w-24 h-24 flex-none flex items-center justify-center">
          <CircularProgress value={result.scoreOutOf10 / 10} size={96} thickness={8} />
          <div className="absolute text-2xl font-medium">{result.scoreOutOf10}/10</div>
        </div>
        <div className="flex-1">
          <div className="text-2xl leading-8">{result.verdictLabel}</div>
          <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant mt-1">{topic.title}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl bg-tertiary-container text-on-tertiary-container text-[15px] leading-[22px] tracking-[0.25px]">
        <Icon name="Alarm" />
        <span>
          Контрольная проверка через {result.nextReviewInDays} дня — {reviewLabel}
        </span>
      </div>

      <div>
        <div className="text-sm font-medium tracking-[0.1px] text-on-surface-variant mb-3">ПО БЛОКАМ</div>
        <div className="flex flex-col gap-3">
          {result.blockScores.map((b) => {
            const fraction = b.total > 0 ? b.correct / b.total : 0;
            const fg = fraction >= 0.8 ? 'var(--md-primary)' : fraction >= 0.5 ? 'var(--md-tertiary)' : 'var(--md-error)';
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="flex-1 text-[15px]">{b.label}</div>
                <div className="w-24 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                  <div className="h-full rounded-full" style={{ background: fg, width: `${fraction * 100}%` }} />
                </div>
                <div className="w-[34px] text-right text-[13px] font-medium" style={{ color: fg }}>
                  {b.correct % 1 === 0 ? b.correct : b.correct.toFixed(1)}/{b.total}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {result.notes.length > 0 && (
        <div>
          <div className="text-sm font-medium tracking-[0.1px] text-on-surface-variant mb-2">ЗАМЕТКИ</div>
          <div className="flex flex-col gap-2.5">
            {result.notes.map((note, i) => (
              <div key={i} className="flex gap-2.5 text-[15px] leading-[22px] tracking-[0.25px]">
                <div className="w-0.5 flex-none rounded-full bg-primary" />
                <div>{note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakOffers.length > 0 && (
        <div>
          <div className="text-sm font-medium tracking-[0.1px] text-on-surface-variant mb-3">СЛАБЫЕ СТОРОНЫ — ДОБАВИТЬ К ИЗУЧЕНИЮ</div>
          <div className="flex flex-col gap-2.5">
            {weakOffers.map((w) => {
              const on = !!s.extrasEnabled[w.key];
              return (
                <div
                  key={w.key}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
                  style={{ border: `1px solid ${on ? 'transparent' : 'var(--md-outline-variant)'}`, background: on ? 'var(--md-primary-container)' : 'transparent' }}
                >
                  <div className="flex-1">
                    <div className="text-base leading-[22px]">{w.title}</div>
                  </div>
                  <div
                    onClick={() => s.toggleExtra(w.key)}
                    className="cursor-pointer px-4 py-2 rounded-full text-sm font-medium"
                    style={{
                      background: on ? 'var(--md-primary)' : 'transparent',
                      color: on ? 'var(--md-on-primary)' : 'var(--md-primary)',
                      border: `1px solid ${on ? 'transparent' : 'var(--md-outline)'}`,
                    }}
                  >
                    {on ? 'Добавлено' : 'Добавить'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <Button variant="filled" size="m" onClick={s.goHome} className="w-full h-14">
          К программе
        </Button>
        <Button variant="tonal" size="s" onClick={s.goExtras} className="w-full">
          Открыть доп. уроки
        </Button>
      </div>
    </div>
  );
}
