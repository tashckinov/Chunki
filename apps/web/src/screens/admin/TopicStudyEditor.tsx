import { useId, useState } from 'react';
import { topicStudyInstructions, topicStudySchema, type CurriculumTopic, type TopicIdentity, type TopicStudyContent, type TopicStudyLevel } from '@app/shared';
import { TopicStudyMaterial } from '../../components/chatmd/TopicStudyMaterial';
import { Button } from '../../components/ui/Button';
import { generateAdminLevelStudy, saveAdminLevelStudy, saveAdminTopicStudy } from '../../lib/admin';

const field = 'w-full rounded-xl border border-border bg-surface px-3 py-2 text-text';
const emptyStudy: TopicStudyContent = { explanation: '', keyPoints: [], contrastExamples: [], exampleChunks: [] };

export function TopicStudyEditor({ topic, curriculum, study, level, onStudySaved }: {
  topic: TopicIdentity;
  curriculum?: CurriculumTopic;
  study: TopicStudyContent | null;
  level?: TopicStudyLevel;
  onStudySaved?: (study: TopicStudyContent) => void;
}) {
  const explanationId = useId();
  const [draft, setDraft] = useState(study ?? emptyStudy);
  const [json, setJson] = useState(study ? JSON.stringify(study, null, 2) : '');
  const [manualPrompt, setManualPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [jsonEdited, setJsonEdited] = useState(false);

  const [published, setPublished] = useState(!!study);
  const [generating, setGenerating] = useState(false);
  const busy = saving || generating;

  async function generate() {
    if (!level) return;
    setGenerating(true);
    setSaveError('');
    try {
      const material = await generateAdminLevelStudy(topic.key, level);
      if (!material.study) throw new Error('Missing study content');
      setDraft(material.study);
      setJson(JSON.stringify(material.study, null, 2));
      setPublished(true);
      setSaved(true);
    } catch {
      setSaveError('Не удалось сгенерировать объяснение. Попробуйте ещё раз.');
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    const prompt = [
      topicStudyInstructions(topic, curriculum, level),
      'Return only a valid JSON object. Preserve this structure and encode line breaks inside explanation as JSON escapes:',
      JSON.stringify({ ...emptyStudy, explanation: 'Объяснение темы\n\n**English example** — перевод.' }, null, 2),
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(prompt);
      setManualPrompt('');
      setCopied(true);
    } catch {
      setManualPrompt(prompt);
    }
  }

  function importStudy() {
    const input = json.trim();
    const fenced = /^\x60{3}(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}$/i.exec(input);
    let value: unknown;
    try {
      value = JSON.parse(fenced?.[1] ?? input);
    } catch {
      setImportError('Не удалось прочитать JSON. Вставьте весь ответ ИИ.');
      return;
    }
    const result = topicStudySchema.safeParse(value);
    if (!result.success) {
      const field = result.error.issues[0].path.join('.');
      setImportError(field ? 'Проверьте поле «' + field + '».' : 'Проверьте структуру JSON по инструкции.');
      return;
    }
    setDraft(result.data);
    setJson(JSON.stringify(result.data, null, 2));
    setJsonEdited(false);
    setImportError('');
    setSaveError('');
    setSaved(false);
  }

  async function save() {
    const result = topicStudySchema.safeParse(draft);
    if (!result.success) {
      setSaveError('Проверьте текст урока и дополнительные поля.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const updated = level
        ? (await saveAdminLevelStudy(topic.key, level, result.data)).study ?? result.data
        : await saveAdminTopicStudy(topic.key, result.data);
      setPublished(true);
      onStudySaved?.(updated);
      setDraft(updated);
      setJson(JSON.stringify(updated, null, 2));
      setSaved(true);
    } catch {
      setSaveError('Не удалось сохранить урок.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 className="text-section-title">{level ? 'Объяснение для ' + level : 'Редактирование урока'}</h2>
      {level && !published && (
        <Button size="sm" variant="secondary" className="self-start" disabled={busy || jsonEdited || !!draft.explanation.trim()}
          onClick={() => void generate()}>
          {generating ? 'Готовим объяснение…' : 'Сгенерировать и сохранить'}
        </Button>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={explanationId} className="text-meta">{level ? 'Текст объяснения (ChatMD)' : 'Текст урока (ChatMD)'}</label>
        <textarea id={explanationId} rows={9} className={field} maxLength={16000} value={draft.explanation} disabled={busy || jsonEdited}
          onChange={(event) => {
            const next = { ...draft, explanation: event.target.value };
            setDraft(next); setJson(JSON.stringify(next, null, 2)); setSaved(false); setSaveError('');
          }} />
      </div>
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer font-medium">Промпт и импорт из ИИ-чата</summary>
        <fieldset className="mt-3 flex flex-col gap-3" disabled={busy}>
          <p className="text-body-secondary">Вставьте промпт в ИИ-чат, перенесите ответ сюда и проверьте урок перед сохранением.</p>
          <Button size="sm" variant="secondary" className="self-start" onClick={() => void copyPrompt()}>
            {copied ? 'Скопировано' : 'Скопировать промпт'}
          </Button>
          {manualPrompt && <label className="flex flex-col gap-1 text-meta">Скопируйте промпт вручную
            <textarea readOnly rows={6} className={field} value={manualPrompt} onFocus={(event) => event.currentTarget.select()} />
          </label>}
          <label className="flex flex-col gap-1 text-meta">JSON урока или полный ответ ИИ
            <textarea rows={6} maxLength={64000} className={field + ' font-mono'} value={json}
              onChange={(event) => { setJson(event.target.value); setJsonEdited(true); setImportError(''); setSaved(false); }} />
          </label>
          {importError && <p role="alert" className="text-negative">{importError}</p>}
          <Button size="sm" variant="secondary" className="self-start" disabled={busy || !jsonEdited || !json.trim()} onClick={importStudy}>
            Открыть в редакторе
          </Button>
          {jsonEdited && <Button size="sm" variant="ghost" className="self-start" onClick={() => {
            setJson(JSON.stringify(draft, null, 2)); setJsonEdited(false); setImportError('');
          }}>Отменить изменения JSON</Button>}
        </fieldset>
      </details>
      {draft.explanation.trim() && (
        <section aria-label="Предпросмотр урока" className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <h3 className="text-section-title">Предпросмотр урока</h3>
          <TopicStudyMaterial study={draft} />
        </section>
      )}
      <Button size="sm" className="self-start" disabled={busy || jsonEdited || !draft.explanation.trim()} onClick={() => void save()}>{level ? 'Сохранить объяснение' : 'Сохранить урок'}</Button>
      {saved && <p role="status" className="text-positive">{level ? 'Объяснение сохранено.' : 'Урок сохранён.'}</p>}
      {saveError && <p role="alert" className="text-negative">{saveError}</p>}
    </section>
  );
}
