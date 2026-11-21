import { useState } from 'react';
import type { ChunkSentence, ChunkSentencePart } from '../../lib/collections';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';

const emptyPart = (): ChunkSentencePart => ({ text: '', explanationRu: '', explanationEn: '' });

export function ContentPartsEditor({ parts, onChange }: { parts: ChunkSentencePart[]; onChange: (parts: ChunkSentencePart[]) => void }) {
  return (
    <details className="rounded-lg border border-border p-2.5">
      <summary className="cursor-pointer text-[13px] font-medium">Разбор по частям ({parts.length})</summary>
      <div className="mt-2 flex flex-col gap-3">
        {parts.map((part, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg bg-surface-subtle p-2.5">
            {(['text', 'explanationRu', 'explanationEn'] as const).map((key) => (
              <label key={key} className="flex flex-col gap-1 text-meta">
                {{ text: 'Фрагмент фразы', explanationRu: 'Пояснение на русском', explanationEn: 'Пояснение на английском' }[key]}
                <Textarea rows={1} value={part[key]} onChange={(value) => onChange(parts.map((item, i) => i === index ? { ...item, [key]: value } : item))} />
              </label>
            ))}
            <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange(parts.filter((_, i) => i !== index))}>Убрать часть</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" className="self-start" disabled={parts.length >= 20}
          onClick={() => onChange([...parts, emptyPart()])}>Добавить часть</Button>
      </div>
    </details>
  );
}

export function ChunkExamplesEditor({ sentences, onSave }: {
  sentences: ChunkSentence[];
  onSave: (sentences: ChunkSentence[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(sentences);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(sentences);

  function change(next: ChunkSentence[]) {
    setDraft(next);
    setFeedback('');
  }

  async function save() {
    const cleaned = draft.map((sentence) => ({
      text: sentence.text.trim(),
      translation: sentence.translation.trim(),
      parts: sentence.parts.map((part) => ({ text: part.text.trim(), explanationRu: part.explanationRu.trim(), explanationEn: part.explanationEn.trim() })),
    }));
    if (cleaned.some((sentence) => !sentence.text || !sentence.translation || !sentence.parts.length
      || sentence.parts.some((part) => !part.text || !part.explanationRu || !part.explanationEn))) {
      setFeedback('Заполните предложение, перевод и хотя бы одну часть с пояснениями на обоих языках.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      await onSave(cleaned);
      setDraft(cleaned);
      setFeedback('Примеры сохранены.');
    } catch {
      setFeedback('Не удалось сохранить примеры.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3">
      {draft.length === 0 && <p className="text-meta">Пока нет примеров.</p>}
      {draft.map((sentence, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <label className="flex flex-col gap-1 text-meta">
            Предложение {index + 1}
            <Textarea rows={2} value={sentence.text} onChange={(text) => change(draft.map((item, i) => i === index ? { ...item, text } : item))} />
          </label>
          <label className="flex flex-col gap-1 text-meta">
            Перевод
            <Textarea rows={2} value={sentence.translation} onChange={(translation) => change(draft.map((item, i) => i === index ? { ...item, translation } : item))} />
          </label>
          <ContentPartsEditor parts={sentence.parts} onChange={(parts) => change(draft.map((item, i) => i === index ? { ...item, parts } : item))} />
          <Button size="sm" variant="ghost" className="self-start" onClick={() => change(draft.filter((_, i) => i !== index))}>Убрать пример</Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={draft.length >= 50}
          onClick={() => change([...draft, { text: '', translation: '', parts: [emptyPart()] }])}>Добавить пример</Button>
        <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить примеры'}</Button>
      </div>
      {feedback && <p role="status" className="text-meta">{feedback}</p>}
    </fieldset>
  );
}
