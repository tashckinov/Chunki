import { useState } from 'react';
import { CEFR_LEVELS, CURRICULUM_CATEGORIES, type CurriculumTopic } from '@app/shared';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/collections';
import { addCurriculumTopic } from '../../lib/admin';

const field = 'min-h-11 rounded-xl border border-border bg-surface px-3 py-2 text-text';
const empty: CurriculumTopic = { id: '', title: '', level: 'A1', category: 'Grammar', objective: '', subtopics: [] };

export function CurriculumEditor({ topics, onCreated }: { topics?: CurriculumTopic[]; onCreated: (topic: CurriculumTopic) => void }) {
  const [draft, setDraft] = useState(empty);
  const [subtopics, setSubtopics] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function create() {
    if (saving) return;
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const topic = await addCurriculumTopic({ ...draft, subtopics: subtopics.split('\n').map((line) => line.trim()).filter(Boolean) });
      onCreated(topic);
      setDraft(empty);
      setSubtopics('');
      setStatus(`Добавлена тема «${topic.title}».`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? 'Такой ID или тема с этим названием, категорией и уровнем уже есть.'
        : 'Не удалось добавить тему. Проверьте поля и подтемы.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-xl border border-border px-4 py-3">
      <summary className="cursor-pointer font-medium">Учебные цели CEFR</summary>
      <ul className="mt-3 divide-y divide-border">
        {topics?.map((topic) => (
          <li key={topic.id} className="py-2">
            <details>
              <summary className="cursor-pointer">{topic.title} · {topic.level} · {topic.category}</summary>
              <p className="mt-1 text-meta">{topic.id}</p>
              <p className="mt-1 text-body-secondary">{topic.objective}</p>
              {topic.subtopics.length > 0 && <ul className="list-disc pl-5 text-body-secondary">
                {topic.subtopics.map((item, index) => <li key={index}>{item}</li>)}
              </ul>}
            </details>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <h3 className="text-section-title">Добавить учебную цель</h3>
        <fieldset disabled={saving} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-meta">Стабильный ID
            <input className={field} value={draft.id} required maxLength={72} pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="a2-polite-requests" onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-meta">Название цели
            <input className={field} value={draft.title} required maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-meta">Уровень цели
              <select className={field} value={draft.level} onChange={(event) => {
                const level = CEFR_LEVELS.find((value) => value === event.target.value);
                if (level) setDraft({ ...draft, level });
              }}>{CEFR_LEVELS.map((value) => <option key={value}>{value}</option>)}</select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-meta">Категория цели
              <select className={field} value={draft.category} onChange={(event) => {
                const category = CURRICULUM_CATEGORIES.find((value) => value === event.target.value);
                if (category) setDraft({ ...draft, category });
              }}>{CURRICULUM_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-meta">Чему научится ученик
            <textarea className={field} rows={3} required maxLength={800} value={draft.objective}
              onChange={(event) => setDraft({ ...draft, objective: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-meta">Подтемы, по одной на строку
            <textarea className={field} rows={3} maxLength={1931} value={subtopics} onChange={(event) => setSubtopics(event.target.value)} />
          </label>
        </fieldset>
        <Button type="submit" className="self-start" size="sm" disabled={saving}>Добавить в CEFR-каталог</Button>
        {status && <p role="status" className="text-positive">{status}</p>}
        {error && <p role="alert" className="text-negative">{error}</p>}
      </form>
    </details>
  );
}
