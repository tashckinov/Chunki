import { useEffect, useState } from 'react';
import { MessageSquarePlus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { getJson, patchJson } from '../lib/collections';

type Rating = 'clear' | 'unclear';
type RatingResponse = { rating: Rating | null };

export function TopicStudyRating({ topicId }: { topicId: string }) {
  const path = '/api/program/topics/' + encodeURIComponent(topicId) + '/study-rating';
  const [rating, setRating] = useState<Rating | null>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  const suggestionPath = '/api/program/topics/' + encodeURIComponent(topicId) + '/study-suggestion';
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [saved, setSaved] = useState(false);

  async function openSuggestion() {
    setShowSuggestion(true);
    setSaved(false);
    setSuggestionError('');
    setSuggestionBusy(true);
    try {
      const result = await getJson<{ message: string | null }>(suggestionPath);
      setMessage(result.message ?? '');
    } catch {
      setSuggestionError('Не удалось загрузить пожелание.');
    } finally {
      setSuggestionBusy(false);
    }
  }

  async function saveSuggestion() {
    setSuggestionBusy(true);
    setSuggestionError('');
    try {
      await patchJson(suggestionPath, { message: message.trim() });
      setShowSuggestion(false);
      setSaved(true);
    } catch {
      setSuggestionError('Не удалось сохранить пожелание. Попробуйте ещё раз.');
    } finally {
      setSuggestionBusy(false);
    }
  }

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
    <section className="space-y-3">
      <fieldset className="flex flex-wrap gap-2 border-t border-border pt-4">
        <legend className="text-meta mb-2">Объяснение было понятным?</legend>
        {([['clear', 'Понятно', ThumbsUp], ['unclear', 'Непонятно', ThumbsDown]] as const).map(([vote, label, Icon]) => (
          <button key={vote} type="button" disabled={busy} aria-pressed={rating === vote} onClick={() => void save(vote)}
            className={'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm disabled:opacity-60 ' +
              (rating === vote ? 'border-accent bg-accent-subtle text-accent' : 'border-border bg-surface text-text')}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
        <button type="button" aria-expanded={showSuggestion} disabled={suggestionBusy}
          onClick={() => showSuggestion ? setShowSuggestion(false) : void openSuggestion()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm">
          <MessageSquarePlus size={16} aria-hidden="true" />Пожелание
        </button>
        {error && <p role="alert" className="w-full text-meta text-negative">Не удалось загрузить или сохранить оценку. Попробуйте ещё раз.</p>}
      </fieldset>
      {showSuggestion && (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void saveSuggestion(); }}>
          <label className="block text-sm">
            Что можно улучшить в объяснении?
            <textarea className="mt-1 block w-full rounded-xl border border-border bg-surface p-3 focus-visible:outline-accent"
              value={message} maxLength={2000} rows={3} required disabled={suggestionBusy}
              onChange={(event) => setMessage(event.target.value)} />
          </label>
          <Button size="sm" type="submit" disabled={suggestionBusy || !message.trim()}>Отправить пожелание</Button>
          {suggestionError && <p role="alert" className="text-meta text-negative">{suggestionError}</p>}
        </form>
      )}
      {saved && <p role="status" className="text-meta">Пожелание сохранено.</p>}
    </section>
  );
}
