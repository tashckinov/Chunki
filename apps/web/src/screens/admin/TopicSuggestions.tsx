import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { getJson } from '../../lib/collections';

interface Suggestion {
  userId: string;
  topicKey: string;
  title: string;
  topicNumber: number | null;
  message: string;
  updatedAt: string;
}

interface SuggestionPage {
  suggestions: Suggestion[];
  nextOffset: number | null;
}

const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function TopicSuggestions({ topicKey, onOpenTopic, initialOffset = 0, onPageChange }: {
  topicKey?: string;
  onOpenTopic?: (key: string) => void;
  initialOffset?: number;
  onPageChange?: (offset: number) => void;
}) {
  const [offset, setOffset] = useState(initialOffset);
  const [page, setPage] = useState<SuggestionPage>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const path = topicKey ? '/api/admin/topic-catalog/' + encodeURIComponent(topicKey) + '/suggestions' : '/api/admin/topic-suggestions';
    getJson<SuggestionPage>(path + '?offset=' + offset)
      .then((result) => { if (active) setPage(result); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [topicKey, offset, retry]);

  function loadPage(next: number) {
    setPage(undefined);
    setError(false);
    setOffset(next);
    onPageChange?.(next);
    setRetry((count) => count + 1);
  }

  const content = (
    <>
      {error ? <div className="mt-2 space-y-2">
        <p role="alert" className="text-negative">Не удалось загрузить пожелания.</p>
        <Button size="sm" variant="secondary" onClick={() => loadPage(offset)}>Повторить</Button>
      </div> : !page ? <p role="status" className="mt-2 text-meta">Загружаем пожелания…</p> : (
        <>
          {page.suggestions.length === 0 && <p className="mt-2 text-meta">Пожеланий пока нет.</p>}
          <ul className="divide-y divide-border">
            {page.suggestions.map((item) => (
              <li key={item.topicKey + ':' + item.userId} className="space-y-1 py-3">
                {onOpenTopic && <h3 className="font-medium wrap-anywhere">{item.topicNumber != null && '№' + item.topicNumber + ' · '}{item.title}</h3>}
                <time dateTime={item.updatedAt} className="text-meta">{date.format(new Date(item.updatedAt))}</time>
                <p className="whitespace-pre-wrap wrap-anywhere text-sm">{item.message}</p>
                {onOpenTopic && <Button size="sm" variant="ghost" onClick={() => onOpenTopic(item.topicKey)}>Открыть урок</Button>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {offset > 0 && <Button size="sm" variant="secondary" onClick={() => loadPage(Math.max(0, offset - 20))}>Назад</Button>}
            {page.nextOffset !== null && <Button size="sm" variant="secondary" onClick={() => loadPage(page.nextOffset!)}>Далее</Button>}
          </div>
        </>
      )}
    </>
  );

  return topicKey ? (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Пожелания учеников</summary>
      {content}
    </details>
  ) : (
    <section className="space-y-2">
      <h2 className="text-section-title">Пожелания учеников</h2>
      {content}
    </section>
  );
}
