import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui/Icon';

export interface InteractiveWordPart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

const TOOLTIP_MAX_WIDTH = 260;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;

/**
 * Tap-a-part-to-see-a-contextual-explanation, shared by the deck card's
 * flipped-side example sentence and the production-check "Ситуация" text.
 * The explanation renders as a small floating card (dictionary-tooltip
 * style), portaled to <body> and anchored to the tapped word — never
 * pushes surrounding layout, and picks whichever side (below/above) the
 * word actually has room for instead of covering nearby content.
 */
export function InteractiveWords({
  parts,
  interfaceMode,
  fallbackText,
  textClassName = 'text-[15px] leading-6 italic',
  inactiveColorClassName = 'text-text-secondary',
}: {
  parts: InteractiveWordPart[];
  interfaceMode: 'ru-en' | 'en-en';
  fallbackText?: string;
  textClassName?: string;
  inactiveColorClassName?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function close() {
    setActive(null);
    setAnchorRect(null);
    setPos(null);
  }

  function toggle(index: number, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (active === index) {
      close();
      return;
    }
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setPos(null);
    setActive(index);
  }

  // Two-pass positioning: render the tooltip invisibly at a guessed spot to
  // measure its real size, then place it below the word if there's room,
  // above it otherwise — all before the browser paints, so there's no flash.
  useLayoutEffect(() => {
    if (active === null || !anchorRect || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const height = el.offsetHeight;
    const width = el.offsetWidth;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const fitsBelow = spaceBelow >= height + ANCHOR_GAP + VIEWPORT_MARGIN;
    const placeBelow = fitsBelow || spaceBelow >= spaceAbove;
    const top = placeBelow ? anchorRect.bottom + ANCHOR_GAP : anchorRect.top - height - ANCHOR_GAP;
    const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
    setPos({ top: Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - height - VIEWPORT_MARGIN), left });
  }, [active, anchorRect]);

  if (parts.length === 0) {
    return fallbackText ? <div className={`text-left ${textClassName}`}>{fallbackText}</div> : null;
  }

  const activePart = active !== null ? parts[active] : null;

  return (
    <div className="flex flex-wrap gap-1.5 text-left" onClick={(e) => e.stopPropagation()}>
      {parts.map((p, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => toggle(i, e)}
          className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 ${textClassName} ${active === i ? 'bg-accent-subtle text-accent' : inactiveColorClassName}`}
        >
          {p.text}
        </button>
      ))}

      {activePart &&
        anchorRect &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
            />
            <div
              ref={tooltipRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: pos?.top ?? anchorRect.bottom + ANCHOR_GAP,
                left: pos?.left ?? anchorRect.left,
                maxWidth: TOOLTIP_MAX_WIDTH,
                opacity: pos ? 1 : 0,
              }}
              className="z-40 rounded-[var(--radius-md)] bg-surface border border-border shadow-[var(--shadow-md)] px-3.5 py-3 anim-rise"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold text-text">{activePart.text}</span>
                <button type="button" onClick={close} aria-label="Закрыть" className="pressable -m-1 flex-none w-5 h-5 flex items-center justify-center text-text-tertiary">
                  <Icon name="Close" size={14} />
                </button>
              </div>
              <div className="text-[13px] leading-[18px] text-text-secondary">{interfaceMode === 'ru-en' ? activePart.explanationRu : activePart.explanationEn}</div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
