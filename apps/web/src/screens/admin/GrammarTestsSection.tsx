import { useEffect, useRef, useState } from 'react';
import { BUILTIN_PLACEMENT_TEST, grammarTestDraftSchema, type McqQuestion, type PlacementTestDefinition } from '@app/shared';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Textarea } from '../../components/ui/Textarea';
import { ApiError } from '../../lib/collections';
import { buildGrammarTestPrompt, parseGrammarTestDraft } from '../../lib/grammarTestPrompt';
import { archiveGrammarTest, fetchGrammarTests, publishGrammarTest, type AdminGrammarTest } from '../../lib/grammarTests';
import { useTimedFlag } from '../../lib/timedFlag';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const FIELD = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3';
const EMPTY_DEFINITION: PlacementTestDefinition = {
  mcq: BUILTIN_PLACEMENT_TEST.mcq.map(({ n }) => ({ n, q: '', options: ['', '', '', ''], correct: 'A' })),
  readingPassage: '',
  readingQuestions: BUILTIN_PLACEMENT_TEST.readingQuestions.map(({ n }) => ({ n, q: '' })),
  essayPrompt: '',
};

export function GrammarTestsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [variants, setVariants] = useState<AdminGrammarTest[]>();
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<PlacementTestDefinition>();
  const [title, setTitle] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');
  const [copied, flashCopied] = useTimedFlag();
  const [busy, setBusy] = useState<'publish' | 'archive' | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const editor = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    fetchGrammarTests().then((items) => { if (active) setVariants(items); })
      .catch(() => { if (active) setError('Не удалось загрузить варианты.'); });
    return () => { active = false; };
  }, []);

  function revealEditor() {
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: 'start' }));
  }

  function edit(variant?: AdminGrammarTest) {
    setEditingId(variant?.id);
    setTitle(variant?.id === 'builtin' ? 'Новый вариант' : variant?.title ?? '');
    setDraft(variant?.definition ?? EMPTY_DEFINITION);
    setFormError('');
    setError('');
    setStatus('');
    revealEditor();
  }

  function editQuestion(index: number, patch: Partial<McqQuestion>) {
    setDraft((current) => current && {
      ...current,
      mcq: current.mcq.map((item, i) => i === index ? { ...item, ...patch } : item),
    });
  }

  async function copyPrompt() {
    const definitions = variants?.slice(0, 5).map(({ definition }) => definition) ?? [BUILTIN_PLACEMENT_TEST];
    const prompt = buildGrammarTestPrompt(definitions.flatMap(({ mcq }) => mcq.map(({ q }) => q)));
    try {
      await navigator.clipboard.writeText(prompt);
      setManualPrompt('');
      flashCopied();
    } catch {
      setManualPrompt(prompt);
    }
  }

  function importDraft() {
    const parsed = parseGrammarTestDraft(importText);
    if (!parsed.ok) {
      setImportError(parsed.message);
      return;
    }
    if (draft && (draft !== EMPTY_DEFINITION || title.trim())
      && !window.confirm('Заменить задания в редакторе импортированным черновиком?')) return;

    if (!editingId || editingId === 'builtin') setTitle(parsed.draft.title);
    setDraft(parsed.draft.definition);
    setImportText('');
    setImportError('');
    setFormError('');
    setStatus('Черновик загружен. Проверьте вопросы и ключи перед публикацией.');
    revealEditor();
  }

  async function publish() {
    if (!draft || busy) return;
    const parsed = grammarTestDraftSchema.safeParse({ title, definition: draft });
    if (!parsed.success) {
      setFormError('Заполните название, все задания и четыре разных ответа к каждому вопросу.');
      return;
    }
    setBusy('publish');
    setFormError('');
    setStatus('');
    try {
      const { variant } = await publishGrammarTest(parsed.data.title, parsed.data.definition, editingId);
      setVariants((current) => {
        const remaining = (current ?? []).filter((item) => item.id !== editingId || item.id === 'builtin');
        return [variant, ...remaining.map((item) => item.id === 'builtin' ? { ...item, active: false } : item)];
      });
      setDraft(undefined);
      setEditingId(undefined);
      setError('');
      setStatus('Вариант опубликован. Его смогут получить пользователи, которые начинают тест.');
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 409
        ? 'Этот вариант уже обновлён или снят с публикации. Обновите страницу.'
        : 'Не удалось опубликовать вариант.');
    } finally {
      setBusy(null);
    }
  }

  async function archive(variant: AdminGrammarTest) {
    if (busy || !window.confirm(`Снять «${variant.title}» с публикации? Начатые тесты останутся доступными.`)) return;
    setBusy('archive');
    setStatus('');
    setError('');
    try {
      await archiveGrammarTest(variant.id);
      setVariants((current) => {
        const remaining = current?.filter((item) => item.id !== variant.id);
        return remaining?.map((item) => item.id === 'builtin' ? { ...item, active: remaining.length === 1 } : item);
      });
      if (editingId === variant.id) { setDraft(undefined); setEditingId(undefined); }
      setStatus('Вариант снят с публикации.');
    } catch {
      setError('Не удалось снять вариант с публикации.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar title="Тест грамматики" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex flex-1 flex-col gap-4 px-5 py-4">
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-section-title">Варианты теста</h2>
          <p className="text-meta">Новые попытки получают один из опубликованных вариантов. Обновление влияет только на новые попытки.</p>
          {!variants && !error && <p className="text-meta">Загружаем варианты…</p>}
          {variants?.map((variant) => (
            <div key={variant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-subtle p-3">
              <div>
                <div className="font-medium">{variant.title}</div>
                <div className="text-meta">{variant.id === 'builtin' ? (variant.active ? 'Используется сейчас' : 'Резервный вариант') : 'Опубликован'}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => edit(variant)}>
                  {variant.id === 'builtin' ? 'Взять за основу' : 'Редактировать'}
                </Button>
                {variant.id !== 'builtin' && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void archive(variant)}>Снять с публикации</Button>}
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => edit()}>Новый вариант</Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-section-title">Промпт для нового теста</h2>
          <p className="text-body-secondary">Вставьте инструкцию в ИИ-чат, затем перенесите ответ в редактор.</p>
          <Button size="sm" variant="secondary" onClick={() => void copyPrompt()}>
            {copied ? 'Скопировано' : 'Копировать инструкцию'}
          </Button>
          {manualPrompt && (
            <label className="flex flex-col gap-1 text-meta">
              Буфер обмена недоступен. Скопируйте инструкцию вручную.
              <textarea readOnly rows={5} value={manualPrompt} onFocus={(event) => event.currentTarget.select()} className={FIELD} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-meta">Ответ ИИ в формате JSON
            <Textarea value={importText} rows={5} onChange={(text) => { setImportText(text); setImportError(''); }}
              placeholder='{"title": "...", "definition": {...}}' />
          </label>
          {importError && <p role="alert" className="text-negative">{importError}</p>}
          <Button size="sm" disabled={!!busy || !importText.trim()} onClick={importDraft}>
            Открыть в редакторе
          </Button>
          {status && <p role="status" className="text-positive">{status}</p>}
          {error && <p role="alert" className="text-negative">{error}</p>}
        </section>

        {draft && (
          <form ref={editor} className="space-y-4 rounded-2xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
            <h2 className="text-section-title">{editingId && editingId !== 'builtin' ? 'Обновление теста' : 'Новый вариант'}</h2>
            <fieldset className="space-y-4" disabled={!!busy}>
              <label className="flex flex-col gap-1 text-meta">Название варианта
                <input className={FIELD} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
              </label>
              {draft.mcq.map((item, index) => (
                <details key={item.n} className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer break-words font-medium">{item.n}. {item.q || 'Вопрос с вариантами'}</summary>
                  <div className="mt-3 space-y-3">
                    <label className="flex flex-col gap-1 text-meta">Вопрос {item.n}
                      <Textarea value={item.q} maxLength={700} rows={2} onChange={(q) => editQuestion(index, { q })} />
                    </label>
                    {item.options.map((value, option) => (
                      <label key={option} className="flex flex-col gap-1 text-meta">Вариант {LETTERS[option]}
                        <input className={FIELD} value={value} maxLength={700} onChange={(event) =>
                          editQuestion(index, { options: item.options.map((answer, i) => i === option ? event.target.value : answer) })} />
                      </label>
                    ))}
                    <label className="flex flex-col gap-1 text-meta">Правильный ответ
                      <select className={FIELD} value={item.correct} onChange={(event) => editQuestion(index, { correct: event.target.value as McqQuestion['correct'] })}>
                        {LETTERS.map((letter) => <option key={letter}>{letter}</option>)}
                      </select>
                    </label>
                  </div>
                </details>
              ))}
              <label className="flex flex-col gap-1 text-meta">Текст для чтения
                <Textarea value={draft.readingPassage} maxLength={4000} rows={5} onChange={(readingPassage) => setDraft({ ...draft, readingPassage })} />
              </label>
              {draft.readingQuestions.map((item, index) => (
                <label key={item.n} className="flex flex-col gap-1 text-meta">Вопрос по тексту {item.n}
                  <Textarea value={item.q} maxLength={700} rows={2} onChange={(q) =>
                    setDraft({ ...draft, readingQuestions: draft.readingQuestions.map((old, i) => i === index ? { ...old, q } : old) })} />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-meta">Тема письменного задания
                <Textarea value={draft.essayPrompt} maxLength={700} rows={3} onChange={(essayPrompt) => setDraft({ ...draft, essayPrompt })} />
              </label>
            </fieldset>
            {formError && <p role="alert" className="text-negative">{formError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!!busy}>
                {busy === 'publish' ? 'Публикуем…' : editingId && editingId !== 'builtin' ? 'Опубликовать обновление' : 'Опубликовать вариант'}
              </Button>
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => { setDraft(undefined); setEditingId(undefined); setFormError(''); }}>Отмена</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
