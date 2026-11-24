import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { getJson } from '../../lib/collections';

interface Suggestion {
  userId: string;
  message: string;
  updatedAt: string;
}

interface SuggestionPage {
  suggestions: Suggestion[];
  nextOffset: number | null;
}

const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function TopicSuggestions({ topicKey }: { topicKey: string }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SuggestionPage>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    getJson<SuggestionPage>('/api/admin/topic-catalog/' + encodeURIComponent(topicKey) + '/suggestions?offset=' + offset)
      .then((result) => { if (active) setPage(result); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [topicKey, offset, retry]);

  function loadPage(next: number) {
    setPage(undefined);
    setError(false);
    setOffset(next);
    setRetry((count) => count + 1);
  }

  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Пожелания учеников</summary>
      {error ? <div className="mt-2 space-y-2">
        <p role="alert" className="text-negative">Не удалось загрузить пожелания.</p>
        <Button size="sm" variant="secondary" onClick={() => loadPage(offset)}>Повторить</Button>
      </div> : !page ? <p role="status" className="mt-2 text-meta">Загружаем пожелания…</p> : (
        <>
          {page.suggestions.length === 0 && <p className="mt-2 text-meta">Пожеланий пока нет.</p>}
          <ul className="divide-y divide-border">
            {page.suggestions.map((item) => (
              <li key={item.userId} className="py-2">
                <time dateTime={item.updatedAt} className="text-meta">{date.format(new Date(item.updatedAt))}</time>
                <p className="whitespace-pre-wrap wrap-anywhere text-sm">{item.message}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {offset > 0 && <Button size="sm" variant="secondary" onClick={() => loadPage(Math.max(0, offset - 20))}>Назад</Button>}
            {page.nextOffset !== null && <Button size="sm" variant="secondary" onClick={() => loadPage(page.nextOffset!)}>Далее</Button>}
          </div>
        </>
      )}
    </details>
  );
}
