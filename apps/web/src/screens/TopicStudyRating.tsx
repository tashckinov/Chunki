import { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { getJson, patchJson } from '../lib/collections';

type Rating = 'clear' | 'unclear';
type RatingResponse = { rating: Rating | null };

export function TopicStudyRating({ topicId }: { topicId: string }) {
  const path = '/api/program/topics/' + encodeURIComponent(topicId) + '/study-rating';
  const [rating, setRating] = useState<Rating | null>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getJson<RatingResponse>(path).then(
      (result) => { if (active) setRating(result.rating); },
      () => { if (active) setError(true); },
    ).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path]);

  async function save(vote: Rating) {
    setBusy(true);
    setError(false);
    try {
      const result = await patchJson<RatingResponse>(path, { rating: vote });
      setRating(result.rating);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-2 border-t border-border pt-4" disabled={busy}>
      <legend className="text-meta mb-2">Объяснение было понятным?</legend>
      {([['clear', 'Понятно', ThumbsUp], ['unclear', 'Непонятно', ThumbsDown]] as const).map(([vote, label, Icon]) => (
        <button key={vote} type="button" aria-pressed={rating === vote} onClick={() => void save(vote)}
          className={'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm disabled:opacity-60 ' +
            (rating === vote ? 'border-accent bg-accent-subtle text-accent' : 'border-border bg-surface text-text')}>
          <Icon size={16} aria-hidden="true" />{label}
        </button>
      ))}
      {error && <p role="alert" className="w-full text-meta text-negative">Не удалось загрузить или сохранить оценку. Попробуйте ещё раз.</p>}
    </fieldset>
  );
}
