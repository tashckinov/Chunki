import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useDeckView } from '../store/derived';
import { Icon } from '../components/ui/Icon';
import { IconButton } from '../components/ui/IconButton';
import { LinearProgress } from '../components/ui/Progress';

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

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-3 pt-2">
        <IconButton icon="Close" label="Закрыть" onClick={s.goHome} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-meta">{v.deckCounter}</div>
          <LinearProgress value={v.deckValue} />
        </div>
        <IconButton icon="Undo" label="Отменить" onClick={s.undoCard} />
      </div>

      <div className="flex-1 min-h-0 relative mx-4 mt-3">
        {v.behind.map((b, i) => (
          <div key={i} className="absolute inset-0 rounded-[var(--radius-lg)] bg-surface-subtle" style={{ transform: b.transform, opacity: b.opacity }} />
        ))}
        <div
          onPointerDown={(e) => s.onCardPointerDown(e.clientX, e.clientY)}
          className="absolute inset-0 rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-sm)] flex flex-col cursor-grab select-none overflow-hidden"
          style={{ transform: v.cardTransform, transition: v.cardTransition }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: v.tintColor, opacity: v.tintOpacity }} />
          <div
            className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-[13px] font-medium bg-negative-subtle text-negative pointer-events-none"
            style={{ opacity: v.opDont }}
          >
            Не знаю
          </div>
          <div
            className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-[13px] font-medium bg-accent-subtle text-accent pointer-events-none"
            style={{ opacity: v.opKnow }}
          >
            Знаю
          </div>
          <div
            className="absolute left-1/2 top-4 -translate-x-1/2 px-3 py-1.5 rounded-full text-[13px] font-medium bg-info-subtle text-info pointer-events-none"
            style={{ opacity: v.opSave }}
          >
            В коллекцию
          </div>
          <div
            className="absolute left-1/2 top-4 -translate-x-1/2 px-3 py-1.5 rounded-full text-[13px] font-medium bg-surface-subtle text-text-secondary pointer-events-none"
            style={{ opacity: v.opBury }}
          >
            Отложить
          </div>
          <div onClick={s.flipCard} className="flex-1 min-h-0 flex flex-col justify-center gap-3.5 px-8 py-8 text-center">
            <div className="text-meta">{v.cur.kind}</div>
            <div className="text-[32px] leading-[40px] font-medium">{v.cur.en}</div>
            <div className="text-[14px] text-text-secondary">{v.cur.ipa}</div>
            {s.flipped ? (
              <div className="flex flex-col gap-3 anim-rise">
                <div className="h-px bg-border" />
                <div className="text-[21px] leading-7 text-accent">{v.cur.ru}</div>
                <div className="text-[15px] leading-6 text-text-secondary italic">{v.cur.ex}</div>
                <div className="text-meta">Из темы: {v.cur.topic}</div>
              </div>
            ) : (
              <div className="text-body-secondary anim-pulse">Нажмите, чтобы увидеть перевод</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none px-6 pt-4 pb-7 flex items-center justify-center gap-4">
        <button onClick={() => s.swipe('dont')} className="pressable w-14 h-14 rounded-full flex items-center justify-center border border-border text-negative">
          <Icon name="Close" size={22} />
        </button>
        <button onClick={() => s.swipe('bury')} className="pressable w-11 h-11 rounded-full flex items-center justify-center border border-border text-text-secondary">
          <Icon name="Snooze" size={19} />
        </button>
        <button onClick={() => s.swipe('save')} className="pressable w-11 h-11 rounded-full flex items-center justify-center bg-info-subtle text-info">
          <Icon name="Bookmark" size={19} />
        </button>
        <button onClick={() => s.swipe('know')} className="pressable w-14 h-14 rounded-full flex items-center justify-center bg-accent text-on-accent">
          <Icon name="Check" size={22} />
        </button>
      </div>
    </div>
  );
}
