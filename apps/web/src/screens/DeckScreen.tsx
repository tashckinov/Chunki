import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useDeckView } from '../store/derived';
import { Icon } from '../components/ui/Icon';
import { IconButton } from '../components/ui/IconButton';
import { LinearProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

export function DeckScreen() {
  const s = useAppStore();
  const v = useDeckView();

  useEffect(() => {
    if (!s.dragging) return;
    const move = (e: PointerEvent) => s.onCardPointerMove(e.clientX, e.clientY);
    const up = () => s.onCardPointerUp();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.dragging]);

  if (!v.cur) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-body-secondary">В этой колоде пока нет карточек.</div>
        <Button onClick={s.back}>Назад</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-3 pt-2">
        <IconButton icon="Close" label="Закрыть" onClick={s.back} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-meta">{v.deckCounter}</div>
          <LinearProgress value={v.deckValue} />
        </div>
        <IconButton icon="Undo" label="Отменить" onClick={s.undoCard} />
      </div>

      <div className="flex-1 min-h-0 relative mx-4 mt-3 overflow-hidden">
        {v.behind.map((b, i) => (
          <div key={i} className="absolute inset-0 rounded-[var(--radius-lg)] bg-surface-subtle" style={{ transform: b.transform, opacity: b.opacity }} />
        ))}
        <div
          onPointerDown={(e) => s.onCardPointerDown(e.clientX, e.clientY)}
          className="absolute inset-0 rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-sm)] flex flex-col cursor-grab select-none overflow-hidden touch-none"
          style={{ transform: v.cardTransform, transition: v.cardTransition }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: v.tintColor, opacity: v.tintOpacity }} />
          <div onClick={s.flipCard} className="scroll-clean flex-1 min-h-0 flex flex-col justify-center gap-3.5 px-8 py-8 text-center">
            <div className="flex flex-col gap-3.5 flex-none">
              {/* One fixed slot, not three — the direction labels share the exact
                  same spot and swap by opacity, sitting a fixed ~14px above the
                  level label rather than drifting to the card's corners. */}
              <div className="relative h-8 flex-none pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-negative-subtle text-negative" style={{ opacity: v.opDont }}>
                    Учить
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-accent-subtle text-accent" style={{ opacity: v.opKnow }}>
                    Знаю
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-surface-subtle text-text-secondary" style={{ opacity: v.opBury }}>
                    Отложить
                  </span>
                </div>
              </div>
              <div className="text-meta">{v.cur.level}</div>
              <div className="text-[32px] leading-[40px] font-medium">{v.cur.text}</div>
              {!s.flipped && <div className="text-body-secondary anim-pulse">Нажмите, чтобы увидеть перевод</div>}
            </div>
            {s.flipped && (
              <div className="flex flex-col gap-3 anim-rise flex-none">
                <div className="h-px bg-border" />
                {s.interfaceMode === 'ru-en' && <div className="text-[21px] leading-7 text-accent">{v.cur.translation}</div>}
                {v.cur.example && <div className="text-[15px] leading-6 text-text-secondary italic">{v.cur.example}</div>}
                {v.cur.explanation && (
                  <div className="rounded-[var(--radius-md)] bg-accent-2-subtle px-4 py-3 text-left">
                    <div className="text-[13.5px] leading-[19px] text-text-secondary">{v.cur.explanation}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none px-6 pt-4 pb-7 flex items-center justify-center gap-6">
        <button onClick={() => s.swipe('dont')} className="pressable w-14 h-14 rounded-full flex items-center justify-center border border-border text-negative">
          <Icon name="Close" size={22} />
        </button>
        <button onClick={() => s.swipe('bury')} className="pressable w-11 h-11 rounded-full flex items-center justify-center border border-border text-text-secondary">
          <Icon name="Snooze" size={19} />
        </button>
        <button onClick={() => s.swipe('know')} className="pressable w-14 h-14 rounded-full flex items-center justify-center bg-accent text-on-accent">
          <Icon name="Check" size={22} />
        </button>
      </div>
    </div>
  );
}
