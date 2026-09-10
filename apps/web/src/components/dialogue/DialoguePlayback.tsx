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
    <div onClick={() => setRevealed(messages.length)} className="flex flex-col gap-3">
      {messages.slice(0, revealed).map((m, i) => (
        <div key={i} className={`flex items-end gap-2 anim-rise max-w-[85%] ${m.side === 'right' ? 'flex-row-reverse self-end' : 'self-start'}`}>
          <img src={apiUrl(m.imageUrl)} alt={m.characterName} className="w-10 h-10 rounded-full object-cover flex-none bg-surface-subtle" />
          <div className={`rounded-[var(--radius-md)] px-3.5 py-2.5 ${m.side === 'right' ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-text'}`}>
            <div className="text-[15px] leading-[21px]">{highlightTarget(m.text, targetText)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
