import { useState } from 'react';

export interface InteractiveWordPart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

/**
 * Tap-a-part-to-see-a-contextual-explanation, shared by the deck card's
 * flipped-side example sentence and the production-check "Ситуация" text —
 * same interaction, different source of parts. If `parts` is empty (nothing
 * authored yet for this sentence/prompt), falls back to plain `fallbackText`
 * when given, or renders nothing.
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

  if (parts.length === 0) {
    return fallbackText ? <div className={`text-left ${textClassName}`}>{fallbackText}</div> : null;
  }

  return (
    <div className="flex flex-col gap-2 text-left" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5">
        {parts.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive((cur) => (cur === i ? null : i))}
            className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 ${textClassName} ${active === i ? 'bg-accent-subtle text-accent' : inactiveColorClassName}`}
          >
            {p.text}
          </button>
        ))}
      </div>
      {active !== null && <div className="text-meta">{interfaceMode === 'ru-en' ? parts[active].explanationRu : parts[active].explanationEn}</div>}
    </div>
  );
}
