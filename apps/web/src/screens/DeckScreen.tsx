import { useEffect, useId, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { BookOpen, Ellipsis } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useDeckView } from '../store/derived';
import { StudyCardExample } from '../components/StudyCardExample';
import { Icon } from '../components/ui/Icon';
import { IconButton } from '../components/ui/IconButton';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';

/** Shown after skipping a card — offers to permanently exclude that same card from future decks. Auto-dismisses like any toast, treating a timeout the same as "Отмена". */
function SkipToast({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const t = setTimeout(onCancel, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(5rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[420px] rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-md)] border border-border px-4 py-3.5 flex flex-col gap-3 anim-rise">
        <div className="text-[14px] font-medium">Больше не показывать эту карточку?</div>
        {/* Icons double the wording so the two actions read apart at a glance, not just by color/position. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="pressable flex-1 rounded-[var(--radius-md)] border border-border text-text-secondary text-[13.5px] font-semibold px-3 py-2.5 flex items-center justify-center gap-1.5"
          >
            <Icon name="Close" size={16} />
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pressable flex-1 rounded-[var(--radius-md)] bg-accent text-on-accent text-[13.5px] font-semibold px-3 py-2.5 flex items-center justify-center gap-1.5"
          >
            <Icon name="EyeOff" size={16} />
            Не показывать
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeckScreen() {
  const s = useAppStore();
  const v = useDeckView();
  const detailsId = useId();
  const [hideChunkId, setHideChunkId] = useState<string | null>(null);
  const [skipToastChunkId, setSkipToastChunkId] = useState<string | null>(null);

  function handleSkip() {
    if (!v.cur || s.flying) return;
    setSkipToastChunkId(v.cur.id);
    s.skipCard();
  }

  function confirmHide() {
    const state = useAppStore.getState();
    if (hideChunkId && !state.flying && state.activeDeckChunks[state.deckIndex]?.id === hideChunkId) {
      state.blockChunk(hideChunkId);
      state.skipCard();
    }
    setHideChunkId(null);
  }

  useEffect(() => {
    if (!s.dragging) return;
    const move = (e: PointerEvent) => s.onCardPointerMove(e.clientX, e.clientY);
    const up = () => s.onCardPointerUp();
    const cancel = () => s.onCardPointerUp(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
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

  const showTranslation = s.interfaceMode === 'ru-en' && !!v.cur.translation;
  const hasDetails = showTranslation || !!v.cur.explanation;
  const total = s.activeDeckChunks.length;
  const current = Math.min(s.deckIndex + 1, total);
  const canUndo = !s.flying && s.activeDeckChunks.some((chunk, index) => index < s.deckIndex && !s.blockedChunkIds[chunk.id]);
  const verdict = v.opBury > Math.max(v.opKnow, v.opDont) ? 'Не уверен' : v.opKnow > v.opDont ? 'Знаю' : 'Не знаю';
  const verdictOpacity = s.dragging || s.flying ? Math.max(v.opBury, v.opKnow, v.opDont) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <header className="mx-auto w-full max-w-2xl shrink-0 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <IconButton icon="Close" label="Закрыть" onClick={s.back} />
          <span className="text-center text-[0.9375em] font-medium tabular-nums">{current} из {total}</span>
          <Menu.Root>
            <Menu.Trigger aria-label="Действия с карточкой" className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-surface-subtle">
              <Ellipsis size={21} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" sideOffset={6} className="study-session z-40">
                <Menu.Popup className="min-w-48 rounded-2xl border border-border bg-surface p-1.5 text-text shadow-[var(--shadow-md)]">
                  <Menu.Item className="study-card-menu-item" onClick={s.undoCard} disabled={!canUndo}>Отменить</Menu.Item>
                  <Menu.Item className="study-card-menu-item" onClick={() => s.swipe('bury')} disabled={!!s.flying}>Не уверен</Menu.Item>
                  <Menu.Item className="study-card-menu-item" onClick={handleSkip} disabled={!!s.flying}>Пропустить карточку</Menu.Item>
                  <Menu.Item className="study-card-menu-item text-negative" onClick={() => {
                    setSkipToastChunkId(null);
                    setHideChunkId(v.cur.id);
                  }} disabled={!!s.flying}>Больше не показывать</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <progress aria-label="Прогресс по колоде" max={total} value={current} className="study-card-progress mx-auto mt-1 block w-2/3" />
      </header>

      <div className="scroll-clean min-h-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
          <article
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button, [role="dialog"]')) return;
              s.onCardPointerDown(event.clientX, event.clientY);
            }}
            className="study-card-motion relative flex touch-pan-y flex-col gap-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)] sm:gap-5 sm:p-6"
            style={{ transform: v.cardTransform, transition: v.cardTransition }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: v.tintColor, opacity: v.tintOpacity }} />
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-accent-subtle px-3 py-1 text-[0.875em] font-semibold text-accent">{v.cur.level}</span>
              <span aria-hidden="true" className="pointer-events-none rounded-full bg-surface-subtle px-3 py-1 text-[0.875em] text-text-secondary" style={{ opacity: verdictOpacity }}>{verdict}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-subtle text-accent sm:size-14" aria-hidden="true"><BookOpen size={24} /></span>
              <div className="min-w-0">
                <h1 lang="en" className="break-words text-[1.75em] leading-tight font-semibold tracking-tight">{v.cur.text}</h1>
              </div>
            </div>
            <StudyCardExample key={v.cur.id} sentences={v.cur.sentences} interfaceMode={s.interfaceMode} />
            {hasDetails && (
              <div className="border-t border-border pt-2">
                <button type="button" aria-expanded={s.flipped} aria-controls={detailsId} onClick={s.flipCard}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-[0.9375em] font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">
                  <Icon name="ChevronForward" size={16} className={s.flipped ? 'rotate-90' : ''} />
                  {s.flipped
                    ? (showTranslation ? 'Скрыть перевод' : 'Скрыть пояснение')
                    : (showTranslation ? 'Показать перевод' : 'Показать пояснение')}
                </button>
                <div id={detailsId} inert={!s.flipped} aria-hidden={!s.flipped}
                  className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200 ${s.flipped ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="mt-1 flex flex-col gap-1.5 rounded-xl bg-accent-subtle px-4 py-3 break-words">
                      {showTranslation && <p className="font-semibold text-accent">{v.cur.translation}</p>}
                      {v.cur.explanation && <p className="leading-relaxed text-text-secondary">{v.cur.explanation}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </div>

      <footer className="shrink-0 bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
          <button type="button" disabled={!!s.flying} onClick={() => s.swipe('dont')} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-full bg-surface-subtle px-3 py-3 text-center font-medium leading-tight text-text disabled:opacity-60">
            <Icon name="Close" size={19} /> Не знаю
          </button>
          <button type="button" disabled={!!s.flying} onClick={() => s.swipe('know')} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-3 py-3 text-center font-medium leading-tight text-on-accent disabled:opacity-60">
            <Icon name="Check" size={19} /> Знаю
          </button>
        </div>
      </footer>

      <Dialog open={!!hideChunkId} onOpenChange={(open) => { if (!open) setHideChunkId(null); }}
        className="study-session text-text" headline="Больше не показывать карточку?"
        actions={<>
          <Button variant="ghost" size="sm" onClick={() => setHideChunkId(null)}>Отмена</Button>
          <Button size="sm" onClick={confirmHide}>Не показывать</Button>
        </>}>
        Карточка будет скрыта из следующих занятий на этом устройстве.
      </Dialog>

      {skipToastChunkId && (
        // Keyed on the chunk id so a second skip before the first toast's
        // timer elapses remounts a fresh instance (fresh 5s countdown)
        // instead of reusing the same one.
        <SkipToast
          key={skipToastChunkId}
          onCancel={() => setSkipToastChunkId(null)}
          onConfirm={() => {
            s.blockChunk(skipToastChunkId);
            setSkipToastChunkId(null);
          }}
        />
      )}
    </div>
  );
}
