import { useAppStore } from '../store/appStore';
import { deckTallyView } from '../store/derived';
import { Button } from '../components/ui/Button';

const VERDICT_COPY: Record<string, { label: string; className: string }> = {
  chunk_used: { label: 'Использовали фразу', className: 'text-positive' },
  meaning_only: { label: 'Смысл верный, без фразы', className: 'text-accent' },
  not_conveyed: { label: 'Не получилось', className: 'text-negative' },
};

export function DeckDoneScreen() {
  const { sessionVerdicts, sessionProductionResults, activeDeckChunks, goCardsLib } = useAppStore();
  const tally = deckTallyView(sessionVerdicts);
  const productionEntries = Object.entries(sessionProductionResults);

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

      {productionEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[15px] font-semibold">Итоги проверки на использование</div>
          {productionEntries.map(([chunkId, result]) => {
            const chunk = activeDeckChunks.find((c) => c.id === chunkId);
            return (
              <div key={chunkId} className="rounded-[var(--radius-md)] border border-border p-3.5 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[14.5px] font-medium">{chunk?.text ?? '—'}</div>
                  <span className={`text-[12px] font-medium ${VERDICT_COPY[result.verdict]?.className ?? ''}`}>
                    {VERDICT_COPY[result.verdict]?.label ?? result.verdict}
                  </span>
                </div>
                <div className="text-body-secondary text-[13.5px]">{result.feedback}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1" />
      <Button size="lg" onClick={goCardsLib} className="w-full">
        Готово
      </Button>
    </div>
  );
}
