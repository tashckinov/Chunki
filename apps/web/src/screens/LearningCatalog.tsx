import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { CurriculumTopic } from '@app/shared';
import { Button } from '../components/ui/Button';
import { getJson } from '../lib/collections';
import { useAppStore } from '../store/appStore';

type CatalogTopic = Pick<CurriculumTopic, 'id' | 'title' | 'level' | 'objective'>;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
const PLURAL = new Intl.PluralRules('ru');

export function LearningCatalog() {
  const { user, go, placementOverview, testVariant, testDraftOwner, testStarting, testStartError, startTest } = useAppStore();
  const quota = placementOverview?.quota;
  const hasDraft = !!user && !!testVariant && testDraftOwner === user.id;
  const blocked = quota?.allowed === false || (quota?.limit != null && quota.used >= quota.limit);
  const [level, setLevel] = useState<(typeof LEVELS)[number] | null>('B1');
  const [full, setFull] = useState(false);
  const [topics, setTopics] = useState<CatalogTopic[]>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    getJson<{ topics: CatalogTopic[] }>('/api/program/catalog').then(
      (catalog) => { if (active) setTopics(catalog.topics); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [retry]);

  const matching = (topics ?? []).filter((topic) => !level || topic.level.replace('+', '') === level);
  const visible = full ? matching : matching.slice(0, 8);
  const count = topics?.length ?? 0;
  const form = PLURAL.select(count);

  return (
    <>
      <section className="space-y-3 rounded-2xl bg-accent-subtle p-4">
        <h2 className="text-section-title">Определите свой уровень английского</h2>
        <p className="text-sm leading-relaxed">Пройдите короткий тест. По результатам Chunki подберёт темы и составит персональную программу обучения.</p>
        <Button disabled={testStarting || (!hasDraft && blocked)} onClick={() => {
          if (!user) go('profile');
          else if (hasDraft) void startTest();
          else go('goals');
        }}>{testStarting ? 'Загружаем тест…' : hasDraft ? 'Продолжить тест' : 'Определить уровень'}</Button>
        {blocked && !hasDraft && <p className="text-meta">{quota?.allowed === false
          ? 'Тест уровня недоступен на вашем тарифе.' : 'Месячный лимит проверок исчерпан.'}</p>}
        {testStartError && <p role="alert" className="text-negative text-sm">{testStartError}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 ref={heading} className="text-section-title" tabIndex={-1}>{full ? 'Каталог тем' : 'Что можно изучать в Chunki'}</h2>
          {topics && <span className="text-meta">{count} {form === 'one' ? 'тема' : form === 'few' ? 'темы' : 'тем'}</span>}
        </div>
        <div role="group" aria-label="Уровень тем" className="flex flex-wrap gap-1">
          {(full ? [null, ...LEVELS] : LEVELS).map((option) => (
            <Button key={option ?? 'all'} size="sm" variant={level === option ? 'secondary' : 'ghost'}
              onClick={() => setLevel(option)} className={level === option ? 'font-semibold' : ''}>
              {option ?? 'Все уровни'}
            </Button>
          ))}
        </div>
        {failed ? (
          <div className="space-y-2">
            <p role="alert" className="text-negative text-sm">Не удалось загрузить каталог тем.</p>
            <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setRetry((n) => n + 1); }}>Повторить</Button>
          </div>
        ) : !topics ? <p role="status" className="text-meta">Загружаем каталог…</p> : (
          <>
            {visible.length === 0 && <p className="text-meta">На этом уровне пока нет тем.</p>}
            <ul className="divide-y divide-border border-b border-border">
              {visible.map((topic) => (
                <li key={topic.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
                      <BookOpen size={16} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium wrap-anywhere">{topic.title}</span>
                        <span className="block text-meta">{topic.level}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <p className="pb-3 pl-7 text-body-secondary wrap-anywhere">{topic.objective}</p>
                  </details>
                </li>
              ))}
            </ul>
            <div className="flex justify-center">
              <Button variant="ghost" onClick={() => {
                setFull(!full);
                setLevel(full ? level ?? 'B1' : null);
                heading.current?.focus();
              }}>{full ? 'Свернуть каталог' : 'Посмотреть все темы'}</Button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
