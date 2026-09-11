import { apiUrl } from '../../lib/collections';
import { RetryImage } from '../ui/RetryImage';
import { Textarea } from '../ui/Textarea';

/**
 * The interactive counterpart to DialoguePlayback's read-only message row:
 * same avatar/side/name layout, but the bubble is an editable Textarea
 * instead of fixed text — this is where the learner writes the character's
 * line themselves to finish the "Ситуация" comic.
 */
export function DialogueAnswerBubble({
  characterName,
  imageUrl,
  side,
  value,
  onChange,
  maxLength,
}: {
  characterName: string;
  imageUrl: string;
  side: 'left' | 'right';
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}) {
  return (
    <div className={`flex items-end gap-3 anim-rise max-w-[92%] ${side === 'right' ? 'flex-row-reverse self-end' : 'self-start'}`}>
      <div className="w-24 h-24 flex-none rounded-[var(--radius-lg)] bg-accent-subtle border border-border shadow-[var(--shadow-xs)] overflow-hidden p-1 flex items-center justify-center">
        <RetryImage src={apiUrl(imageUrl)} alt={characterName} className="max-w-full max-h-full object-contain object-top" />
      </div>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className={`text-meta px-1 ${side === 'right' ? 'text-right' : ''}`}>{characterName}</div>
        <Textarea value={value} onChange={onChange} placeholder={`Что скажет ${characterName}?`} rows={3} maxLength={maxLength} />
      </div>
    </div>
  );
}
