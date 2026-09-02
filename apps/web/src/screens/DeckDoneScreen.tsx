import { useAppStore } from '../store/appStore';
import { deckTallyView } from '../store/derived';
import { Button } from '../components/ui/Button';

export function DeckDoneScreen() {
  const { verdicts, goHome } = useAppStore();
  const tally = deckTallyView(verdicts);

  return (
    <div className="flex-1 min-h-0 px-6 py-8 flex flex-col gap-6 anim-rise">
      <div className="text-[32px] leading-10">Колода пройдена</div>
      <div className="flex gap-3">
        {tally.map((t) => (
          <div key={t.label} className="flex-1 px-3 py-4 rounded-xl" style={{ background: t.bg, color: t.fg }}>
            <div className="text-[28px] leading-9">{t.n}</div>
            <div className="text-xs tracking-[0.4px] mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="text-[15px] leading-[22px] tracking-[0.25px] text-on-surface-variant">
        Чанки, которые вы не знали, вернутся в упражнения темы и в колоду через день.
      </div>
      <div className="flex-1" />
      <Button variant="filled" size="m" onClick={goHome} className="w-full h-14">
        На главную
      </Button>
    </div>
  );
}
