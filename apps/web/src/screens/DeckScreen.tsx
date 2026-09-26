import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDeckView } from '../store/derived';
import type { ChunkSentence } from '../lib/collections';
import { InteractiveWords } from '../components/InteractiveWords';
import { Icon } from '../components/ui/Icon';
import { IconButton } from '../components/ui/IconButton';
import { LinearProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

/**
 * Replaces the old flat, non-interactive example sentence: shows one of the
 * chunk's ~3 example sentences (picked at random, stable for as long as
 * this card stays flipped — it remounts fresh on the next flip) as tappable
 * parts via the shared InteractiveWords component.
 */
function InteractiveSentence({ sentences, interfaceMode }: { sentences: ChunkSentence[]; interfaceMode: 'ru-en' | 'en-en' }) {
  const sentence = useMemo(() => (sentences.length ? sentences[Math.floor(Math.random() * sentences.length)] : null), [sentences]);
  if (!sentence) return null;
  return <InteractiveWords parts={sentence.parts} interfaceMode={interfaceMode} />;
}

/** Shown after "Пропустить" — offers to permanently exclude that same card from future decks. Auto-dismisses like any toast, treating a timeout the same as "Отмена". */
function SkipToast({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const t = setTimeout(onCancel, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[420px] rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-md)] border border-border px-4 py-3.5 flex items-center gap-2 anim-rise">
        <div className="flex-1 text-[14px] font-medium">Больше не показывать карточку</div>
        <button type="button" onClick={onCancel} className="pressable flex-none rounded-[var(--radius-md)] text-text-secondary text-[13.5px] font-semibold px-3 py-2">
          Отмена
        </button>
        <button type="button" onClick={onConfirm} className="pressable flex-none rounded-[var(--radius-md)] bg-accent text-on-accent text-[13.5px] font-semibold px-4 py-2">
          Ок
        </button>
      </div>
    </div>
  );
}

export function DeckScreen() {
  const s = useAppStore();
  const v = useDeckView();
  const [translationShown, setTranslationShown] = useState(false);
  const [skipToastChunkId, setSkipToastChunkId] = useState<string | null>(null);

  function handleSkip() {
    if (!v.cur || s.flying) return;
    setSkipToastChunkId(v.cur.id);
    s.skipCard();
  }

  // Resets whenever the card is unflipped (front shown again — either the
  // same card flipped back, or the next card starting fresh), so the
  // translation is hidden behind the button again each time.
  useEffect(() => {
    if (!s.flipped) setTranslationShown(false);
  }, [s.flipped]);

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
                    Не знаю
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-accent-subtle text-accent" style={{ opacity: v.opKnow }}>
                    Знаю
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-surface-subtle text-text-secondary" style={{ opacity: v.opBury }}>
                    Не уверен
                  </span>
                </div>
              </div>
              <div className="text-meta">{v.cur.level}</div>
              <div className="text-[32px] leading-[40px] font-medium">{v.cur.text}</div>
              {!s.flipped && <div className="text-body-secondary anim-pulse">Нажмите, чтобы перевернуть карточку</div>}
            </div>
            {s.flipped && (
              <div className="flex flex-col gap-1 anim-rise flex-none">
                <div className="h-px bg-border" />
                {v.cur.explanation && (
                  <div className="rounded-[var(--radius-md)] bg-accent-2-subtle px-4 py-3 text-left">
                    <div className="text-[13.5px] leading-[19px] text-text-secondary">{v.cur.explanation}</div>
                  </div>
                )}
                <InteractiveSentence sentences={v.cur.sentences} interfaceMode={s.interfaceMode} />
                {s.interfaceMode === 'ru-en' &&
                  (translationShown ? (
                    <div className="text-[21px] leading-7 text-accent">{v.cur.translation}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTranslationShown(true);
                      }}
                      className="pressable self-start text-[15px] font-medium text-accent"
                    >
                      Показать перевод
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none px-6 pt-4 pb-5 flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-4 w-full">
          <button onClick={() => s.swipe('dont')} className="pressable flex-1 max-w-[168px] h-14 rounded-full flex items-center justify-center gap-2 border border-border text-negative">
            <Icon name="Close" size={20} />
            <span className="text-[15px] font-medium">Не знаю</span>
          </button>
          <button onClick={() => s.swipe('know')} className="pressable flex-1 max-w-[168px] h-14 rounded-full flex items-center justify-center gap-2 bg-accent text-on-accent">
            <Icon name="Check" size={20} />
            <span className="text-[15px] font-medium">Знаю</span>
          </button>
        </div>
        <button onClick={handleSkip} className="pressable text-[14px] font-medium text-text-secondary px-3 py-1.5">
          Пропустить
        </button>
      </div>

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
