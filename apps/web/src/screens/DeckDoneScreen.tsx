import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { ProductionVerdict } from '../lib/progress';
import { deckTallyView } from '../store/derived';
import { plural } from '../lib/plural';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const VERDICT_COPY: Record<string, { label: string; className: string }> = {
  chunk_used: { label: 'Использовали фразу', className: 'text-positive' },
  meaning_only: { label: 'Смысл верный, без фразы', className: 'text-accent' },
  not_conveyed: { label: 'Не получилось', className: 'text-negative' },
};

function ProductionResultRow({
  chunkText,
  result,
}: {
  chunkText: string;
  result: { kind: 'ok'; verdict: ProductionVerdict; feedback: string } | { kind: 'error'; message: string };
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14.5px] font-medium">{chunkText}</div>
        {result.kind === 'ok' ? (
          <span className={`text-[12px] font-medium ${VERDICT_COPY[result.verdict]?.className ?? ''}`}>
            {VERDICT_COPY[result.verdict]?.label ?? result.verdict}
          </span>
        ) : (
          <span className="text-[12px] font-medium text-negative">Не удалось проверить</span>
        )}
      </div>
      <div className="text-body-secondary text-[13.5px]">{result.kind === 'ok' ? result.feedback : result.message}</div>
    </div>
  );
}

export function DeckDoneScreen() {
  const {
    sessionVerdicts,
    sessionProductionResults,
    sessionProductionPending,
    productionLimitReached,
    activeDeckChunks,
    goCardsLib,
  } = useAppStore();
  const tally = deckTallyView(sessionVerdicts);
  const productionEntries = Object.entries(sessionProductionResults);
  const pendingCount = Object.keys(sessionProductionPending).length;
  const [subscribeStub, setSubscribeStub] = useState(false);

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
            const chunk = activeDeckChunks.find((c) => c.id === chunkId);
            return <ProductionResultRow key={chunkId} chunkText={chunk?.text ?? '—'} result={result} />;
          })}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2.5 text-body-secondary text-[13.5px] py-1">
              <Spinner size={16} borderWidth={2} />
              Проверяем ещё {pendingCount} {plural(pendingCount, 'ответ', 'ответа', 'ответов')}…
            </div>
          )}
        </div>
      )}

      {productionLimitReached && (
        <div className="rounded-[var(--radius-md)] bg-accent-subtle p-4 flex flex-col gap-2.5">
          <div className="text-[14.5px] font-semibold">Бесплатные проверки закончились</div>
          <div className="text-body-secondary text-[13.5px]">
            На бесплатном тарифе доступно 3 проверки предложений. Хотите больше? Оформите подписку.
          </div>
          {subscribeStub ? (
            <div className="text-negative text-[13.5px]">Извините, не получилось. Подписка пока не доступна.</div>
          ) : (
            <Button size="sm" onClick={() => setSubscribeStub(true)}>
              Оформить подписку
            </Button>
          )}
        </div>
      )}

      <div className="flex-1" />
      <Button size="lg" onClick={goCardsLib} className="w-full">
        Готово
      </Button>
    </div>
  );
}
