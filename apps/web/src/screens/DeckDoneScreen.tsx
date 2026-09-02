import { useAppStore } from '../store/appStore';
import { deckTallyView } from '../store/derived';
import { Button } from '../components/ui/Button';

export function DeckDoneScreen() {
  const { verdicts, goCardsLib } = useAppStore();
  const tally = deckTallyView(verdicts);

  return (
    <div className="flex-1 min-h-0 px-5 py-8 flex flex-col gap-8 anim-rise">
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
      <div className="text-body-secondary">Чанки, которые вы не знали, вернутся в упражнения темы и в колоду через день.</div>
      <div className="flex-1" />
      <Button size="lg" onClick={goCardsLib} className="w-full">
        Готово
      </Button>
    </div>
  );
}
