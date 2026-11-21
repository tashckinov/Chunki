import { useEffect, useRef, useState } from 'react';
import { CEFR_LEVELS, TOPIC_CATEGORIES, type TopicIdentity } from '@app/shared';
import { ChatMD } from '../../components/chatmd/ChatMD';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/collections';
import { fetchAdminCatalogTopic, fetchAdminTopicCatalog, saveAdminCatalogTopic, type AdminCatalogTopic } from '../../lib/admin';

const field = 'min-h-11 rounded-xl border border-border bg-surface px-3 text-text';

export function ProgramCatalogPanel() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState({ q: '', offset: 0 });
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAdminTopicCatalog>>>();
  const [listError, setListError] = useState(false);
  const [key, setKey] = useState<string>();
  const [topic, setTopic] = useState<AdminCatalogTopic>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const detail = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    fetchAdminTopicCatalog(page.q, page.offset).then((value) => { if (active) setData(value); })
      .catch(() => { if (active) setListError(true); });
    return () => { active = false; };
  }, [page]);

  useEffect(() => {
    if (!key) return;
    detail.current?.scrollIntoView({ block: 'start' });
    let active = true;
    fetchAdminCatalogTopic(key).then((value) => { if (active) setTopic(value); })
      .catch(() => { if (active) setError('Не удалось открыть тему.'); });
    return () => { active = false; };
  }, [key]);

  function loadPage(q: string, offset: number) {
    setData(undefined);
    setListError(false);
    setPage({ q, offset });
  }

  function update(patch: Partial<TopicIdentity>) {
    setTopic((previous) => previous && { ...previous, ...patch });
    setSaved(false);
  }

  async function save() {
    if (!topic || !topic.title.trim() || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setTopic(await saveAdminCatalogTopic(topic));
      setSaved(true);
      loadPage(page.q, page.offset);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? 'Такое название уже есть в каталоге. Найдите существующую тему через поиск.'
        : 'Не удалось сохранить тему.');
    } finally {
      setSaving(false);
    }
  }

  if (key) return (
    <section ref={detail} className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="self-start" disabled={saving} onClick={() => {
        setKey(undefined); setTopic(undefined); setError(''); setSaved(false);
      }}>К каталогу</Button>
      {error && <p role="alert" className="text-negative">{error}</p>}
      {!topic && !error && <p className="text-body-secondary">Загрузка темы…</p>}
      {topic && (
        <>
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <fieldset disabled={saving} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-meta">Название темы
                <input value={topic.title} onChange={(event) => update({ title: event.target.value })}
                  className={field} maxLength={160} required />
              </label>
              <label className="flex flex-col gap-1 text-meta">Уровень CEFR
                <select className={field} value={topic.level ?? ''} onChange={(event) =>
                  update({ level: CEFR_LEVELS.find((level) => level === event.target.value) ?? null })}>
                  <option value="">Уровень не указан</option>
                  {CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-meta">Категория
                <select className={field} value={topic.category} onChange={(event) => {
                  const category = TOPIC_CATEGORIES.find((item) => item === event.target.value);
                  if (category) update({ category });
                }}>
                  {TOPIC_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
            </fieldset>
            <p className="text-meta wrap-anywhere">{[topic.key, ...topic.aliases].join(' · ')}</p>
            <Button type="submit" size="sm" className="self-start" disabled={saving || !topic.title.trim()}>Сохранить тему</Button>
            {saved && <p role="status" className="text-positive">Тема сохранена.</p>}
          </form>
          <section aria-label="Предпросмотр урока" className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <h2 className="text-section-title">Предпросмотр урока</h2>
            {topic.study ? (
              <>
                <ChatMD source={topic.study.explanation} />
                {topic.study.keyPoints.length > 0 && <ul className="list-disc pl-5">{topic.study.keyPoints.map((text, index) => <li key={index}>{text}</li>)}</ul>}
                {topic.study.contrastExamples.map(({ wrong, right }, index) => (
                  <p key={index} className="text-body-secondary"><del>{wrong}</del> → {right}</p>
                ))}
                {topic.study.exampleChunks.length > 0 && <p className="text-body-secondary">{topic.study.exampleChunks.join(' · ')}</p>}
              </>
            ) : <p className="text-body-secondary">Общее объяснение для этой темы пока не сохранено.</p>}
          </section>
        </>
      )}
    </section>
  );

  const nextOffset = data?.nextOffset;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section-title">Каталог тем</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); loadPage(search.trim(), 0); }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" aria-label="Поиск тем"
          placeholder="Название или ключ" className={`${field} min-w-40 flex-1`} maxLength={160} />
        <Button type="submit" size="sm">Найти</Button>
      </form>
      {listError && <p role="alert" className="text-negative">Не удалось загрузить каталог.</p>}
      {!data && !listError && <p className="text-body-secondary">Загрузка…</p>}
      {data?.topics.length === 0 && <p className="text-body-secondary">Темы не найдены.</p>}
      {data && data.topics.length > 0 && (
        <ul className="rounded-xl border border-border divide-y divide-border">
          {data.topics.map((item) => (
            <li key={item.key}>
              <button type="button" onClick={() => setKey(item.key)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-subtle">
                <span className="wrap-anywhere">{item.title}</span>
                <span className="shrink-0 text-meta">{item.level ?? 'Без уровня'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        {page.offset > 0 && <Button variant="secondary" size="sm" onClick={() => loadPage(page.q, Math.max(0, page.offset - 50))}>Назад</Button>}
        {nextOffset != null && <Button variant="secondary" size="sm" onClick={() => loadPage(page.q, nextOffset)}>Далее</Button>}
      </div>
    </section>
  );
}
