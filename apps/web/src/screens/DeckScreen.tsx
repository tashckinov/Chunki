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
    <div className="flex-1 min-h-0 flex flex-col bg-surface-container-low">
      <div className="flex items-center gap-2 px-2 pt-1">
        <IconButton icon="Close" label="Закрыть" size="m" onClick={s.goHome} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">{v.deckCounter}</div>
          <LinearProgress value={v.deckValue} />
        </div>
        <IconButton icon="Undo" label="Отменить" size="m" onClick={s.undoCard} />
      </div>

      <div className="flex-1 min-h-0 relative mx-4 mt-3">
        {v.behind.map((b, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[28px] bg-surface-container-highest border border-outline-variant"
            style={{ transform: b.transform, opacity: b.opacity }}
          />
        ))}
        <div
          onPointerDown={(e) => s.onCardPointerDown(e.clientX, e.clientY)}
          className="absolute inset-0 rounded-[28px] bg-surface flex flex-col cursor-grab select-none overflow-hidden"
          style={{ transform: v.cardTransform, transition: v.cardTransition, boxShadow: '0 1px 3px 1px rgba(0,0,0,.15)' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: v.tintColor, opacity: v.tintOpacity }} />
          <div
            className="absolute top-[18px] left-[18px] px-3.5 py-1.5 rounded-full text-sm font-medium bg-error text-on-error pointer-events-none"
            style={{ opacity: v.opDont }}
          >
            Не знаю
          </div>
          <div
            className="absolute top-[18px] right-[18px] px-3.5 py-1.5 rounded-full text-sm font-medium bg-primary text-on-primary pointer-events-none"
            style={{ opacity: v.opKnow }}
          >
            Знаю
          </div>
          <div
            className="absolute left-1/2 top-[18px] -translate-x-1/2 px-3.5 py-1.5 rounded-full text-sm font-medium bg-tertiary text-on-tertiary pointer-events-none"
            style={{ opacity: v.opSave }}
          >
            В коллекцию
          </div>
          <div
            className="absolute left-1/2 top-[18px] -translate-x-1/2 px-3.5 py-1.5 rounded-full text-sm font-medium bg-inverse-surface text-inverse-on-surface pointer-events-none"
            style={{ opacity: v.opBury }}
          >
            Отложить
          </div>
          <div onClick={s.flipCard} className="flex-1 min-h-0 flex flex-col justify-center gap-3.5 px-7 py-8 text-center">
            <div className="text-[11px] font-medium tracking-[0.5px] text-on-surface-variant">{v.cur.kind}</div>
            <div className="text-[34px] leading-[42px]">{v.cur.en}</div>
            <div className="text-sm tracking-[0.25px] text-on-surface-variant">{v.cur.ipa}</div>
            {s.flipped ? (
              <div className="flex flex-col gap-3 anim-rise">
                <div className="h-px bg-outline-variant" />
                <div className="text-[22px] leading-7 text-primary">{v.cur.ru}</div>
                <div className="text-base leading-6 tracking-[0.5px] text-on-surface-variant italic">{v.cur.ex}</div>
                <div className="text-[13px] tracking-[0.4px] text-on-surface-variant">Из темы: {v.cur.topic}</div>
              </div>
            ) : (
              <div className="text-sm tracking-[0.25px] text-on-surface-variant anim-pulse">Нажмите, чтобы увидеть перевод</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none px-6 pt-[18px] pb-[26px] flex items-center justify-center gap-4">
        <div onClick={() => s.swipe('dont')} className="cursor-pointer w-14 h-14 rounded-full flex items-center justify-center border border-outline text-error">
          <Icon name="Close" />
        </div>
        <div
          onClick={() => s.swipe('bury')}
          className="cursor-pointer w-12 h-12 rounded-full flex items-center justify-center border border-outline-variant text-on-surface-variant"
        >
          <Icon name="Snooze" />
        </div>
        <div onClick={() => s.swipe('save')} className="cursor-pointer w-12 h-12 rounded-full flex items-center justify-center bg-tertiary-container text-on-tertiary-container">
          <Icon name="Bookmark" />
        </div>
        <div onClick={() => s.swipe('know')} className="cursor-pointer w-14 h-14 rounded-full flex items-center justify-center bg-primary text-on-primary">
          <Icon name="Check" />
        </div>
      </div>
    </div>
  );
}
