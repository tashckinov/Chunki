import { useEffect, useState } from 'react';
import { apiUrl } from '../../lib/collections';
import { highlightTarget } from '../../lib/textHighlight';

export interface PlaybackMessage {
  characterName: string;
  imageUrl: string;
  side: 'left' | 'right';
  text: string;
}

/**
 * The one presentational renderer for "just the clean dialogue" — no
 * editor chrome, ever. Used identically by the learner-facing screen
 * (sequential auto-reveal) and the admin's Learner Preview mode (everything
 * shown at once), so what's previewed and what's actually shown can never
 * drift apart.
 */
export function DialoguePlayback({
  messages,
  targetText,
  autoPlay = true,
  onAllRevealed,
}: {
  messages: PlaybackMessage[];
  targetText?: string | null;
  autoPlay?: boolean;
  onAllRevealed?: () => void;
}) {
  const [revealed, setRevealed] = useState(autoPlay ? 0 : messages.length);

  useEffect(() => {
    if (!autoPlay) return;
    if (revealed >= messages.length) {
      if (messages.length > 0) onAllRevealed?.();
      return;
    }
    const delay = revealed === 0 ? 300 : 900;
    const t = setTimeout(() => setRevealed((n) => n + 1), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, autoPlay, messages.length]);

  return (
    <div onClick={() => setRevealed(messages.length)} className="flex flex-col gap-4">
      {messages.slice(0, revealed).map((m, i) => (
        <div key={i} className={`flex items-end gap-3 anim-rise max-w-[92%] ${m.side === 'right' ? 'flex-row-reverse self-end' : 'self-start'}`}>
          <div className="w-24 h-24 flex-none rounded-[var(--radius-lg)] bg-accent-subtle border border-border shadow-[var(--shadow-xs)] overflow-hidden p-1 flex items-center justify-center">
            <img src={apiUrl(m.imageUrl)} alt={m.characterName} className="max-w-full max-h-full object-contain object-top" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <div className={`text-meta px-1 ${m.side === 'right' ? 'text-right' : ''}`}>{m.characterName}</div>
            <div className={`rounded-[var(--radius-lg)] px-4 py-3 ${m.side === 'right' ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-text'}`}>
              <div className="text-[16px] leading-[22px]">{highlightTarget(m.text, targetText)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
