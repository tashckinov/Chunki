import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { postProductionRating, type ProductionRating } from '../lib/progress';
import { useAppStore } from '../store/appStore';
import { deckTallyView } from '../store/derived';
import { plural } from '../lib/plural';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

type ProductionResult = { kind: 'ok'; isAppropriate: boolean; usedChunkId: string | null; usedChunkText: string | null; feedback: string; modelAnswer?: string; checkId?: string } | { kind: 'error'; message: string };

/** cardChunkId is the deck card this row is for — usedChunkId may point at a different chunk (a sibling in the same semantic group) that actually got the progress credit. */
function productionBadge(result: ProductionResult, cardChunkId: string): { label: string; className: string } {
  if (result.kind === 'error') return { label: 'Не удалось проверить', className: 'text-negative' };
  if (!result.isAppropriate) return { label: 'Не получилось', className: 'text-negative' };
  if (!result.usedChunkId) return { label: 'Смысл верный, без знакомой фразы', className: 'text-accent' };
  if (result.usedChunkId === cardChunkId) return { label: 'Использовали фразу', className: 'text-positive' };
  return { label: `Использовали «${result.usedChunkText}»`, className: 'text-positive' };
}

function RatingButtons({ checkId }: { checkId: string }) {
  const [rating, setRating] = useState<ProductionRating>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function vote(value: ProductionRating) {
    setSaving(true);
    setError(false);
    try {
      await postProductionRating(checkId, value);
      setRating(value);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Оценка проверки">
      {([{ value: 'up', label: 'Полезная проверка', Icon: ThumbsUp },
        { value: 'down', label: 'Бесполезная проверка', Icon: ThumbsDown }] as const).map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-label={label} aria-pressed={rating === value}
          disabled={saving || rating === value} onClick={() => void vote(value)}
          className={`rounded-md border border-border p-2 ${rating === value ? 'bg-accent-subtle text-accent' : 'text-text-secondary'}`}>
          <Icon size={16} />
        </button>
      ))}
      {error && <span role="alert" className="text-negative text-meta">Не удалось сохранить оценку.</span>}
    </div>
  );
}

function ProductionResultRow({ chunkText, chunkId, result }: { chunkText: string; chunkId: string; result: ProductionResult }) {
  const badge = productionBadge(result, chunkId);
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14.5px] font-medium">{chunkText}</div>
        <span className={`text-[12px] font-medium ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="text-body-secondary text-[13.5px]">{result.kind === 'ok' ? result.feedback : result.message}</div>
      {result.kind === 'ok' && result.modelAnswer && (
        <div className="text-[13.5px]">
          <span className="text-text-secondary">Реплика персонажа: </span>
          <span className="text-accent">«{result.modelAnswer}»</span>
        </div>
      )}
      {result.kind === 'ok' && result.checkId && <RatingButtons key={result.checkId} checkId={result.checkId} />}
    </div>
  );
}

export function DeckDoneScreen() {
  const {
    sessionVerdicts,
    sessionProductionResults,
    sessionProductionPending,
    sessionProductionChunkTexts,
    productionBlock,
    activeDeckChunks,
    goCardsLib,
    go,
  } = useAppStore();
  const tally = deckTallyView(sessionVerdicts);
  const productionEntries = Object.entries(sessionProductionResults);
  const pendingCount = Object.keys(sessionProductionPending).length;

  return (
    <div className="flex-1 min-h-0 px-5 py-8 flex flex-col gap-8 anim-rise overflow-y-auto scroll-clean">
      <div className="text-page-title">Колода пройдена</div>
      <div className="flex gap-3">
        {tally.map((t) => (
          <div key={t.label} className="flex-1 rounded-[var(--radius-md)] px-3 py-4" style={{ background: t.bg }}>
            <div className="text-[26px] font-semibold" style={{ color: t.fg }}>
              {t.n}
            </div>
            <div className="text-meta mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="text-body-secondary">Чанки, которые вы не знали, можно повторить в этой же колоде.</div>

      {(productionEntries.length > 0 || pendingCount > 0) && (
        <div className="flex flex-col gap-3">
          <div className="text-[15px] font-semibold">Итоги проверки на использование</div>
          {productionEntries.map(([chunkId, result]) => {
            // A deferred "Знаю" check's card may have come due in a later
            // session than the one it was queued in — activeDeckChunks won't
            // have it, so sessionProductionChunkTexts (filled in whenever the
            // check actually started) is the reliable source.
            const chunkText = sessionProductionChunkTexts[chunkId] ?? activeDeckChunks.find((c) => c.id === chunkId)?.text ?? '—';
            return <ProductionResultRow key={chunkId} chunkId={chunkId} chunkText={chunkText} result={result} />;
          })}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2.5 text-body-secondary text-[13.5px] py-1">
              <Spinner size={16} borderWidth={2} />
              Проверяем ещё {pendingCount} {plural(pendingCount, 'ответ', 'ответа', 'ответов')}…
            </div>
          )}
        </div>
      )}

      {productionBlock && (
        <div className="rounded-[var(--radius-md)] bg-accent-subtle p-4 flex flex-col gap-2.5">
          <div className="text-[14.5px] font-semibold">
            {productionBlock.reason === 'limit_reached' ? 'Дневной лимит проверок исчерпан' : 'Проверка предложений недоступна на вашем тарифе'}
          </div>
          <div className="text-body-secondary text-[13.5px]">
            {productionBlock.upsellTariffs.length > 0
              ? `Доступно в тарифах: ${productionBlock.upsellTariffs.map((t) => t.name).join(', ')}.`
              : 'Хотите больше? Оформите подписку.'}
          </div>
          <Button size="sm" onClick={() => go('checkout')}>
            Оформить подписку
          </Button>
        </div>
      )}

      <div className="flex-1" />
      <Button size="lg" onClick={goCardsLib} className="w-full">
        Готово
      </Button>
    </div>
  );
}
