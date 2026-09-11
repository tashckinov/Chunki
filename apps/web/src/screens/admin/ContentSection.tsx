import { useEffect, useRef, useState, type ReactNode } from 'react';
import { plural } from '../../lib/plural';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Switch } from '../../components/ui/Switch';
import { IconButton } from '../../components/ui/IconButton';
import { Icon } from '../../components/ui/Icon';
import { RetryImage } from '../../components/ui/RetryImage';
import { apiUrl } from '../../lib/collections';
import {
  fetchAdminCollections,
  createAdminCollection,
  updateAdminCollection,
  uploadCollectionBanner,
  fetchAdminChunks,
  createAdminChunk,
  updateAdminChunk,
  deleteAdminChunk,
  removeChunkFromCollection,
  type AdminCollection,
  type AdminChunk,
  type NewChunkInput,
} from '../../lib/admin';
import { fetchCharacters, type Character } from '../../lib/characters';
import { saveAdminDialogue } from '../../lib/dialogues';
import { buildDialogueAiPrompt, buildBulkDialogueAiPrompt } from '../../lib/dialogueAiPrompt';
import { buildBulkChunkCreatePrompt, buildBulkSentencesRegeneratePrompt } from '../../lib/chunkAiPrompt';
import { parseDialogueImport, parseBulkDialogueImport, toPlaybackMessages, type ParsedDialogue, type BulkParsedDialogue } from '../../lib/dialogueImport';
import { parseBulkChunkCreateImport, parseBulkSentencesImport, type ParsedChunkCreate, type BulkParsedSentences } from '../../lib/chunkImport';
import type { ChunkSentence } from '../../lib/collections';
import { Sheet } from '../../components/ui/Sheet';
import { DialoguePlayback } from '../../components/dialogue/DialoguePlayback';
import { DialogueBuilderView } from './DialogueBuilderView';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

function LevelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full box-border rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3 text-body outline-none"
    >
      {LEVELS.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

/** Persistent label + optional hint — placeholders alone disappear once you start typing, which was the source of "куда что писать" confusion in this editor. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-meta">{hint}</span>}
    </label>
  );
}

/** Bold, accent-colored trailing nav-bar action — iOS-style "Save"/"Done" button. */
function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pressable flex-none text-[14.5px] font-semibold text-accent disabled:opacity-50 px-2">
      {saving ? 'Сохраняем…' : 'Сохранить'}
    </button>
  );
}

type ContentView =
  | { kind: 'collections' }
  | { kind: 'chunks'; collectionId: string }
  | { kind: 'editChunk'; collectionId: string; chunk: AdminChunk | 'new' }
  | { kind: 'editCollection'; collectionId?: string } // no collectionId = creating a new one, from the collections root
  | { kind: 'editDialogue'; collectionId: string; chunk: AdminChunk };

interface ChunkFormValue {
  text: string;
  translation: string;
  explanation: string;
  level: string;
  situationPrompts: string[];
}

const EMPTY_CHUNK_FORM: ChunkFormValue = { text: '', translation: '', explanation: '', level: 'A2', situationPrompts: [] };

function chunkToForm(chunk: AdminChunk): ChunkFormValue {
  return {
    text: chunk.text,
    translation: chunk.translation,
    explanation: chunk.explanation ?? '',
    level: chunk.level,
    situationPrompts: chunk.situationPrompts,
  };
}

// Sentences aren't hand-edited here — they're authored/updated only through
// the AI copy/paste flow (single-create or bulk-regenerate), so omitting the
// field on a PATCH leaves a chunk's existing sentences untouched.
function formToChunkInput(v: ChunkFormValue): NewChunkInput {
  return {
    text: v.text.trim(),
    translation: v.translation.trim(),
    explanation: v.explanation.trim() || null,
    level: v.level,
    situationPrompts: v.situationPrompts.map((p) => p.trim()).filter(Boolean),
  };
}

function ChunkEditView({
  chunk,
  onCancel,
  onSubmit,
}: {
  chunk: AdminChunk | 'new';
  onCancel: () => void;
  onSubmit: (value: ChunkFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<ChunkFormValue>(chunk !== 'new' ? chunkToForm(chunk) : EMPTY_CHUNK_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm(chunk !== 'new' ? chunkToForm(chunk) : EMPTY_CHUNK_FORM);
  }, [chunk]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar
        title={chunk === 'new' ? 'Новый чанк' : 'Редактировать чанк'}
        onBack={onCancel}
        trailing={<SaveButton onClick={save} saving={saving} disabled={saving || !form.text.trim() || !form.translation.trim()} />}
      />
      <div className="scroll-clean flex-1 min-h-0 px-5 py-4">
        <div className="flex flex-col gap-4">
          {saveError && <div className="text-negative text-[13px]">Не удалось сохранить: {saveError}</div>}
          <Field label="Фраза (английский)" hint="Лицевая сторона карточки — то, что должен выучить пользователь.">
            <Input value={form.text} onChange={(v) => setForm((f) => ({ ...f, text: v }))} placeholder="sounds good" />
          </Field>
          <Field label="Перевод (русский)" hint="Оборот карточки.">
            <Input value={form.translation} onChange={(v) => setForm((f) => ({ ...f, translation: v }))} placeholder="звучит хорошо" />
          </Field>
          <Field label="Пояснение (необязательно)" hint="Короткое объяснение значения — под переводом на обороте.">
            <Textarea value={form.explanation} onChange={(v) => setForm((f) => ({ ...f, explanation: v }))} placeholder="Used to agree to a suggestion." rows={2} />
          </Field>
          <Field label="Уровень (CEFR)" hint="Влияет на дистракторы в проверке на узнавание.">
            <LevelSelect value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v }))} />
          </Field>
          {chunk !== 'new' && (
            <Field
              label={`Предложения (${chunk.sentences.length})`}
              hint="Каждое предложение разбито на части с объяснением — редактируются через «Массово обновить предложения» в списке чанков коллекции, не здесь."
            >
              {chunk.sentences.length > 0 ? (
                <div className="text-[14px] text-text-secondary">{chunk.sentences[0].text}</div>
              ) : (
                <div className="text-meta">Пока нет предложений.</div>
              )}
            </Field>
          )}
          <Field
            label={`Ситуации для продакшн-проверки (${form.situationPrompts.length})`}
            hint={
              'Если есть хотя бы одна — после «Знаю» или верного ответа в проверке на узнавание пользователю покажут ' +
              'одну из них по очереди (на английском) и попросят естественно ответить, использовав фразу. Пусто — ' +
              'чанк просто засчитывается по самооценке, без реальной проверки.'
            }
          >
            <div className="flex flex-col gap-2">
              {form.situationPrompts.map((prompt, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Textarea
                    value={prompt}
                    onChange={(v) => setForm((f) => ({ ...f, situationPrompts: f.situationPrompts.map((p, j) => (j === i ? v : p)) }))}
                    placeholder="A friend suggests meeting at 7pm. You're happy with that. What do you reply?"
                    rows={2}
                  />
                  <IconButton
                    icon="Delete"
                    label="Удалить вопрос"
                    size="sm"
                    tone="muted"
                    onClick={() => setForm((f) => ({ ...f, situationPrompts: f.situationPrompts.filter((_, j) => j !== i) }))}
                  />
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setForm((f) => ({ ...f, situationPrompts: [...f.situationPrompts, ''] }))}>
                + Добавить вопрос
              </Button>
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

interface CollectionFormValue {
  slug: string;
  title: string;
  description: string;
  level: string;
  position: string;
  isPublished: boolean;
  bannerUrl: string | null;
}

const EMPTY_COLLECTION_FORM: CollectionFormValue = { slug: '', title: '', description: '', level: 'A2', position: '0', isPublished: false, bannerUrl: null };

function collectionToForm(c: AdminCollection): CollectionFormValue {
  return { slug: c.slug, title: c.title, description: c.description ?? '', level: c.level, position: String(c.position), isPublished: c.isPublished, bannerUrl: c.bannerUrl };
}

function CollectionEditView({
  collection,
  onCancel,
  onSubmit,
}: {
  collection: AdminCollection | null;
  onCancel: () => void;
  onSubmit: (value: CollectionFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<CollectionFormValue>(collection ? collectionToForm(collection) : EMPTY_COLLECTION_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => {
    setForm(collection ? collectionToForm(collection) : EMPTY_COLLECTION_FORM);
  }, [collection]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleBannerFile(file: File) {
    setBannerUploading(true);
    setBannerError(null);
    try {
      const url = await uploadCollectionBanner(file);
      setForm((f) => ({ ...f, bannerUrl: url }));
    } catch {
      setBannerError('Не удалось загрузить изображение.');
    } finally {
      setBannerUploading(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar
        title={collection ? 'Редактировать коллекцию' : 'Новая коллекция'}
        onBack={onCancel}
        trailing={<SaveButton onClick={save} saving={saving} disabled={saving || !form.slug.trim() || !form.title.trim()} />}
      />
      <div className="scroll-clean flex-1 min-h-0 px-5 py-4">
        <div className="flex flex-col gap-4">
          {saveError && <div className="text-negative text-[13px]">Не удалось сохранить: {saveError}</div>}
          <Field label="Slug (URL)" hint="Латиницей через дефис, например travel-basics. Не менять у уже опубликованной колоды без необходимости.">
            <Input value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="travel-basics" />
          </Field>
          <Field label="Название" hint="Видно пользователям в списке колод.">
            <Input value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Travel Basics" />
          </Field>
          <Field label="Описание" hint="Короткий текст под названием в списке.">
            <Textarea value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Useful English chunks for airports, hotels and travelling." rows={2} />
          </Field>
          <Field label="Уровень (CEFR)">
            <LevelSelect value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v }))} />
          </Field>
          <Field label="Позиция" hint="Порядок среди колод — меньше число, выше в списке.">
            <Input value={form.position} onChange={(v) => setForm((f) => ({ ...f, position: v }))} placeholder="0" type="number" />
          </Field>
          <Field label="Баннер коллекции (необязательно)" hint="Рекомендуемые пропорции 800×600 (4:3) — показывается в списке колод пользователю.">
            <div className="flex flex-col gap-2">
              <div className="aspect-[4/3] w-full max-w-[280px] rounded-[var(--radius-md)] bg-surface-subtle overflow-hidden flex items-center justify-center">
                {form.bannerUrl ? (
                  <RetryImage src={apiUrl(form.bannerUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-meta">Нет баннера</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="pressable inline-flex items-center rounded-[var(--radius-md)] bg-surface-subtle px-4 py-2 text-[13.5px] font-medium cursor-pointer">
                  {bannerUploading ? 'Загружаем…' : form.bannerUrl ? 'Заменить' : 'Загрузить'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={bannerUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleBannerFile(file);
                    }}
                  />
                </label>
                {form.bannerUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, bannerUrl: null }))}>
                    Удалить
                  </Button>
                )}
              </div>
              {bannerError && <span className="text-negative text-[13px]">{bannerError}</span>}
            </div>
          </Field>
          <div className="flex items-center justify-between px-1">
            <div className="flex flex-col">
              <span className="text-[14px] font-medium">Опубликована</span>
              <span className="text-meta">Выключено — черновик, не виден пользователям.</span>
            </div>
            <Switch checked={form.isPublished} onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The same copy-prompt / paste-and-preview / approve loop DialogueBuilderView
 * offers, but reachable directly from a chunk row — a quick round-trip
 * through an external AI without opening the full editor. Approving calls
 * the same save endpoint the builder uses, so the result is identical either way.
 */
function DialogueQuickActions({ chunk, characters, onSaved }: { chunk: AdminChunk; characters: Character[] | null; onSaved: () => void }) {
  const [copied, setCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedDialogue | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function copy() {
    if (!characters) return;
    await navigator.clipboard.writeText(buildDialogueAiPrompt(chunk, characters));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleParse() {
    const result = parseDialogueImport(importText, characters ?? []);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    setImportError(null);
    setPreview(result.dialogue);
  }

  async function approve() {
    if (!preview) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAdminDialogue(chunk.id, preview);
      closeSheet(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function closeSheet(open: boolean) {
    if (open) {
      setImportOpen(true);
      return;
    }
    setImportOpen(false);
    setImportText('');
    setImportError(null);
    setPreview(null);
    setSaveError(null);
  }

  const playbackMessages = preview ? toPlaybackMessages(preview, characters ?? []) : [];

  return (
    <>
      <IconButton icon={copied ? 'Check' : 'Copy'} label="Скопировать инструкцию для ИИ" size="sm" onClick={copy} disabled={!characters} />
      <IconButton icon="Paste" label="Вставить диалог от ИИ" size="sm" onClick={() => closeSheet(true)} disabled={!characters} />

      <Sheet open={importOpen} onOpenChange={closeSheet} title={`Диалог через ИИ — «${chunk.text}»`}>
        {!preview ? (
          <div className="flex flex-col gap-3">
            <div className="text-[13.5px] text-body-secondary">Вставьте JSON-ответ ИИ, полученный по скопированной инструкции.</div>
            <Textarea
              value={importText}
              onChange={(v) => {
                setImportText(v);
                setImportError(null);
              }}
              placeholder='{"participants": [...], "messages": [...]}'
              rows={10}
            />
            {importError && <div className="text-negative text-[13px]">{importError}</div>}
            <Button size="sm" onClick={handleParse} disabled={!importText.trim()}>
              Вставить и посмотреть
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <DialoguePlayback messages={playbackMessages} targetText={chunk.text} />
            {saveError && <div className="text-negative text-[13px]">Не удалось сохранить: {saveError}</div>}
            <div className="flex gap-2">
              <Button size="sm" onClick={approve} disabled={saving}>
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Назад
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Row of one entry in the bulk-import preview list — collapsed by default, expands to the full DialoguePlayback preview. */
function BulkPreviewRow({ item, chunkText, characters }: { item: BulkParsedDialogue; chunkText: string; characters: Character[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3 flex flex-col gap-2">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="pressable flex items-center justify-between gap-2 text-left">
        <span className="text-[14px] truncate">{chunkText}</span>
        <span className="text-meta flex-none">
          {item.dialogue.messages.length} {plural(item.dialogue.messages.length, 'реплика', 'реплики', 'реплик')}
        </span>
      </button>
      {expanded && <DialoguePlayback messages={toPlaybackMessages(item.dialogue, characters)} targetText={chunkText} />}
    </div>
  );
}

/**
 * The same copy/paste-and-preview/approve loop as DialogueQuickActions, but
 * for an entire collection at once — one copy/paste round trip covers every
 * chunk, letting the admin redo a whole collection's comics (e.g. with a
 * newly-expanded cast of characters) without repeating the cycle per chunk.
 */
function BulkDialogueAiSheet({
  open,
  onOpenChange,
  collectionTitle,
  chunks,
  characters,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionTitle: string;
  chunks: AdminChunk[];
  characters: Character[] | null;
  onSaved: (chunkId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkParsedDialogue[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{ okCount: number; total: number; failedChunkTexts: string[] } | null>(null);
  // Tracks which chunkIds already saved successfully so a retry after a
  // partial failure only re-attempts the ones that actually failed.
  const savedChunkIdsRef = useRef<Set<string>>(new Set());

  async function copy() {
    if (!characters) return;
    await navigator.clipboard.writeText(buildBulkDialogueAiPrompt(chunks, characters));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleParse() {
    const result = parseBulkDialogueImport(importText, chunks, characters ?? []);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    setImportError(null);
    setSaveSummary(null);
    savedChunkIdsRef.current = new Set();
    setPreview(result.dialogues);
  }

  async function saveAll() {
    if (!preview) return;
    setSaving(true);
    const pending = preview.filter((item) => !savedChunkIdsRef.current.has(item.chunkId));
    const failedChunkTexts: string[] = [];
    for (const item of pending) {
      try {
        await saveAdminDialogue(item.chunkId, item.dialogue);
        savedChunkIdsRef.current.add(item.chunkId);
        onSaved(item.chunkId);
      } catch {
        failedChunkTexts.push(chunks.find((c) => c.id === item.chunkId)?.text ?? item.chunkId);
      }
    }
    setSaveSummary({ okCount: savedChunkIdsRef.current.size, total: preview.length, failedChunkTexts });
    setSaving(false);
  }

  function closeSheet(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    onOpenChange(false);
    setImportText('');
    setImportError(null);
    setPreview(null);
    setSaveSummary(null);
    savedChunkIdsRef.current = new Set();
  }

  return (
    <Sheet open={open} onOpenChange={closeSheet} title={`Диалоги через ИИ — «${collectionTitle}»`}>
      {!preview ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] text-body-secondary">
            Скопируйте инструкцию для всей коллекции, сгенерируйте диалоги во внешнем ИИ-чате, затем вставьте ответ ниже.
          </div>
          <Button size="sm" variant="secondary" onClick={copy} disabled={!characters}>
            {copied ? 'Скопировано' : `Копировать инструкцию (${chunks.length} ${plural(chunks.length, 'чанк', 'чанка', 'чанков')})`}
          </Button>
          <Textarea
            value={importText}
            onChange={(v) => {
              setImportText(v);
              setImportError(null);
            }}
            placeholder='{"dialogues": [...]}'
            rows={10}
          />
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <Button size="sm" onClick={handleParse} disabled={!importText.trim()}>
            Вставить и посмотреть
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
            {preview.map((item) => (
              <BulkPreviewRow key={item.chunkId} item={item} chunkText={chunks.find((c) => c.id === item.chunkId)?.text ?? item.chunkId} characters={characters ?? []} />
            ))}
          </div>
          {saveSummary && (
            <div className={saveSummary.failedChunkTexts.length > 0 ? 'text-negative text-[13px]' : 'text-[13px] text-body-secondary'}>
              Сохранено {saveSummary.okCount} из {saveSummary.total}
              {saveSummary.failedChunkTexts.length > 0 ? ` — не удалось: ${saveSummary.failedChunkTexts.join(', ')}` : ''}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? 'Сохраняем…' : `Сохранить все (${preview.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Назад
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Row of one entry in the bulk-create preview list — collapsed by default, expands to a translation + all its sentences. */
function BulkChunkCreatePreviewRow({ chunk }: { chunk: ParsedChunkCreate }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3 flex flex-col gap-2">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="pressable flex items-center justify-between gap-2 text-left">
        <span className="text-[14px] truncate">{chunk.text}</span>
        <span className="text-meta flex-none">
          {chunk.sentences.length} {plural(chunk.sentences.length, 'предложение', 'предложения', 'предложений')}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2">
          <div className="text-[13.5px] text-body-secondary">{chunk.translation}</div>
          {chunk.sentences.map((s, i) => (
            <div key={i} className="text-[13.5px]">
              <div>{s.text}</div>
              <div className="text-meta">{s.translation}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 4: bulk-CREATE brand-new chunks for a collection via the same
 * copy-prompt / paste-and-preview / approve loop as the dialogue bulk sheet
 * above, just producing whole new chunks (with ~3 example sentences each)
 * instead of comics for existing ones. Reuses the existing single-chunk
 * POST endpoint in a client-side loop — no new backend route needed.
 */
function BulkChunkCreateAiSheet({
  open,
  onOpenChange,
  collectionId,
  collectionTitle,
  level,
  existingChunkTexts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionTitle: string;
  level: string;
  existingChunkTexts: string[];
  onSaved: (chunk: AdminChunk) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState('5');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedChunkCreate[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{ okCount: number; total: number; failedChunkTexts: string[] } | null>(null);
  // Tracks which preview indices already created successfully so a retry
  // after a partial failure only re-attempts the ones that actually failed.
  const savedIndexesRef = useRef<Set<number>>(new Set());

  async function copy() {
    const n = Math.max(1, Number(count) || 5);
    await navigator.clipboard.writeText(buildBulkChunkCreatePrompt(collectionTitle, level, n, existingChunkTexts));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleParse() {
    const result = parseBulkChunkCreateImport(importText);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    setImportError(null);
    setSaveSummary(null);
    savedIndexesRef.current = new Set();
    setPreview(result.chunks);
  }

  async function saveAll() {
    if (!preview) return;
    setSaving(true);
    const failedChunkTexts: string[] = [];
    for (let i = 0; i < preview.length; i++) {
      if (savedIndexesRef.current.has(i)) continue;
      try {
        const created = await createAdminChunk(collectionId, preview[i]);
        savedIndexesRef.current.add(i);
        onSaved(created);
      } catch {
        failedChunkTexts.push(preview[i].text);
      }
    }
    setSaveSummary({ okCount: savedIndexesRef.current.size, total: preview.length, failedChunkTexts });
    setSaving(false);
  }

  function closeSheet(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    onOpenChange(false);
    setImportText('');
    setImportError(null);
    setPreview(null);
    setSaveSummary(null);
    savedIndexesRef.current = new Set();
  }

  return (
    <Sheet open={open} onOpenChange={closeSheet} title={`Новые чанки через ИИ — «${collectionTitle}»`}>
      {!preview ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] text-body-secondary">
            Скопируйте инструкцию, сгенерируйте новые чанки во внешнем ИИ-чате, затем вставьте ответ ниже.
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20">
              <Input value={count} onChange={setCount} placeholder="5" type="number" />
            </div>
            <span className="text-[13.5px] text-body-secondary">чанков</span>
          </div>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? 'Скопировано' : 'Копировать инструкцию'}
          </Button>
          <Textarea
            value={importText}
            onChange={(v) => {
              setImportText(v);
              setImportError(null);
            }}
            placeholder='{"chunks": [...]}'
            rows={10}
          />
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <Button size="sm" onClick={handleParse} disabled={!importText.trim()}>
            Вставить и посмотреть
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
            {preview.map((chunk, i) => (
              <BulkChunkCreatePreviewRow key={i} chunk={chunk} />
            ))}
          </div>
          {saveSummary && (
            <div className={saveSummary.failedChunkTexts.length > 0 ? 'text-negative text-[13px]' : 'text-[13px] text-body-secondary'}>
              Создано {saveSummary.okCount} из {saveSummary.total}
              {saveSummary.failedChunkTexts.length > 0 ? ` — не удалось: ${saveSummary.failedChunkTexts.join(', ')}` : ''}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? 'Создаём…' : `Создать все (${preview.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Назад
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Row of one entry in the bulk-sentences preview list — collapsed by default, expands to all its sentences. */
function BulkSentencesPreviewRow({ item, chunkText }: { item: BulkParsedSentences; chunkText: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3 flex flex-col gap-2">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="pressable flex items-center justify-between gap-2 text-left">
        <span className="text-[14px] truncate">{chunkText}</span>
        <span className="text-meta flex-none">
          {item.sentences.length} {plural(item.sentences.length, 'предложение', 'предложения', 'предложений')}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2">
          {item.sentences.map((s, i) => (
            <div key={i} className="text-[13.5px]">
              <div>{s.text}</div>
              <div className="text-meta">{s.translation}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 4: bulk-REGENERATE example sentences for chunks that already exist
 * — a deliberately separate copy/paste round from BulkDialogueAiSheet above
 * (confirmed with the user), touching only sentences, never dialogues.
 */
function BulkSentencesRegenerateAiSheet({
  open,
  onOpenChange,
  collectionTitle,
  chunks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionTitle: string;
  chunks: AdminChunk[];
  onSaved: (chunkId: string, sentences: ChunkSentence[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkParsedSentences[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{ okCount: number; total: number; failedChunkTexts: string[] } | null>(null);
  const savedChunkIdsRef = useRef<Set<string>>(new Set());

  async function copy() {
    await navigator.clipboard.writeText(buildBulkSentencesRegeneratePrompt(chunks.map((c) => ({ id: c.id, text: c.text, translation: c.translation }))));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleParse() {
    const result = parseBulkSentencesImport(importText, chunks);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    setImportError(null);
    setSaveSummary(null);
    savedChunkIdsRef.current = new Set();
    setPreview(result.items);
  }

  async function saveAll() {
    if (!preview) return;
    setSaving(true);
    const pending = preview.filter((item) => !savedChunkIdsRef.current.has(item.chunkId));
    const failedChunkTexts: string[] = [];
    for (const item of pending) {
      try {
        await updateAdminChunk(item.chunkId, { sentences: item.sentences });
        savedChunkIdsRef.current.add(item.chunkId);
        onSaved(item.chunkId, item.sentences);
      } catch {
        failedChunkTexts.push(chunks.find((c) => c.id === item.chunkId)?.text ?? item.chunkId);
      }
    }
    setSaveSummary({ okCount: savedChunkIdsRef.current.size, total: preview.length, failedChunkTexts });
    setSaving(false);
  }

  function closeSheet(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    onOpenChange(false);
    setImportText('');
    setImportError(null);
    setPreview(null);
    setSaveSummary(null);
    savedChunkIdsRef.current = new Set();
  }

  return (
    <Sheet open={open} onOpenChange={closeSheet} title={`Предложения через ИИ — «${collectionTitle}»`}>
      {!preview ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] text-body-secondary">
            Скопируйте инструкцию для всей коллекции, сгенерируйте новые примеры предложений во внешнем ИИ-чате, затем вставьте ответ ниже.
          </div>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? 'Скопировано' : `Копировать инструкцию (${chunks.length} ${plural(chunks.length, 'чанк', 'чанка', 'чанков')})`}
          </Button>
          <Textarea
            value={importText}
            onChange={(v) => {
              setImportText(v);
              setImportError(null);
            }}
            placeholder='{"sentencesByChunk": [...]}'
            rows={10}
          />
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <Button size="sm" onClick={handleParse} disabled={!importText.trim()}>
            Вставить и посмотреть
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
            {preview.map((item) => (
              <BulkSentencesPreviewRow key={item.chunkId} item={item} chunkText={chunks.find((c) => c.id === item.chunkId)?.text ?? item.chunkId} />
            ))}
          </div>
          {saveSummary && (
            <div className={saveSummary.failedChunkTexts.length > 0 ? 'text-negative text-[13px]' : 'text-[13px] text-body-secondary'}>
              Сохранено {saveSummary.okCount} из {saveSummary.total}
              {saveSummary.failedChunkTexts.length > 0 ? ` — не удалось: ${saveSummary.failedChunkTexts.join(', ')}` : ''}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? 'Сохраняем…' : `Сохранить все (${preview.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Назад
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function ContentSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [collections, setCollections] = useState<AdminCollection[] | null>(null);
  const [chunks, setChunks] = useState<AdminChunk[] | null>(null);
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ContentView>({ kind: 'collections' });
  const [bulkAiOpen, setBulkAiOpen] = useState(false);
  const [bulkChunkCreateOpen, setBulkChunkCreateOpen] = useState(false);
  const [bulkSentencesOpen, setBulkSentencesOpen] = useState(false);

  useEffect(() => {
    fetchAdminCollections()
      .then(setCollections)
      .catch(() => setError('Не удалось загрузить коллекции.'));
    // Best-effort — only needed for the quick copy/paste-AI actions on the
    // chunks list; those buttons just stay disabled if this fails.
    fetchCharacters()
      .then(setCharacters)
      .catch(() => {});
  }, []);

  function markChunkHasDialogue(chunkId: string) {
    setChunks((prev) => prev?.map((c) => (c.id === chunkId ? { ...c, hasDialogue: true } : c)) ?? prev);
  }

  function handleBulkChunkCreated(collectionId: string, chunk: AdminChunk) {
    setChunks((prev) => (prev ? [...prev, chunk] : [chunk]));
    bumpChunkCount(collectionId, 1);
  }

  function handleBulkSentencesSaved(chunkId: string, sentences: ChunkSentence[]) {
    setChunks((prev) => prev?.map((c) => (c.id === chunkId ? { ...c, sentences } : c)) ?? prev);
  }

  const activeCollectionId = view.kind === 'chunks' || view.kind === 'editChunk' ? view.collectionId : null;

  useEffect(() => {
    if (!activeCollectionId) {
      setChunks(null);
      return;
    }
    fetchAdminChunks(activeCollectionId)
      .then(setChunks)
      .catch(() => setError('Не удалось загрузить чанки.'));
  }, [activeCollectionId]);

  function bumpChunkCount(collectionId: string, delta: number) {
    setCollections((prev) => prev?.map((c) => (c.id === collectionId ? { ...c, chunkCount: Math.max(0, c.chunkCount + delta) } : c)) ?? prev);
  }

  async function handleCreateChunk(collectionId: string, value: ChunkFormValue) {
    const chunk = await createAdminChunk(collectionId, formToChunkInput(value));
    setChunks((prev) => (prev ? [...prev, chunk] : [chunk]));
    bumpChunkCount(collectionId, 1);
    setView({ kind: 'chunks', collectionId });
  }

  async function handleUpdateChunk(collectionId: string, id: string, value: ChunkFormValue) {
    const updated = await updateAdminChunk(id, formToChunkInput(value));
    setChunks((prev) => prev?.map((c) => (c.id === id ? { ...c, ...updated } : c)) ?? prev);
    setView({ kind: 'chunks', collectionId });
  }

  async function handleDeleteChunk(collectionId: string, chunk: AdminChunk) {
    if (!window.confirm(`Удалить чанк «${chunk.text}» полностью, из всех коллекций?`)) return;
    await deleteAdminChunk(chunk.id);
    setChunks((prev) => prev?.filter((c) => c.id !== chunk.id) ?? prev);
    bumpChunkCount(collectionId, -1);
  }

  async function handleDetachChunk(collectionId: string, chunk: AdminChunk) {
    await removeChunkFromCollection(collectionId, chunk.id);
    setChunks((prev) => prev?.filter((c) => c.id !== chunk.id) ?? prev);
    bumpChunkCount(collectionId, -1);
  }

  async function handleCreateCollection(value: CollectionFormValue) {
    const created = await createAdminCollection({
      slug: value.slug.trim(),
      title: value.title.trim(),
      description: value.description.trim() || null,
      level: value.level,
      position: Number(value.position) || 0,
      isPublished: value.isPublished,
      bannerUrl: value.bannerUrl,
    });
    setCollections((prev) => (prev ? [...prev, created] : [created]));
    setView({ kind: 'chunks', collectionId: created.id });
  }

  async function handleUpdateCollection(collectionId: string, value: CollectionFormValue) {
    const updated = await updateAdminCollection(collectionId, {
      slug: value.slug.trim(),
      title: value.title.trim(),
      description: value.description.trim() || null,
      level: value.level,
      position: Number(value.position) || 0,
      isPublished: value.isPublished,
      bannerUrl: value.bannerUrl,
    });
    setCollections((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
    setView({ kind: 'chunks', collectionId });
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NavigationBar title="Контент" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
        <div className="px-5 py-4 text-negative">{error}</div>
      </div>
    );
  }

  if (view.kind === 'editChunk') {
    const { collectionId, chunk } = view;
    return (
      <ChunkEditView
        chunk={chunk}
        onCancel={() => setView({ kind: 'chunks', collectionId })}
        onSubmit={(value) => (chunk === 'new' ? handleCreateChunk(collectionId, value) : handleUpdateChunk(collectionId, chunk.id, value))}
      />
    );
  }

  if (view.kind === 'editDialogue') {
    const { collectionId, chunk } = view;
    return <DialogueBuilderView chunk={chunk} onBack={() => setView({ kind: 'chunks', collectionId })} />;
  }

  if (view.kind === 'editCollection') {
    const { collectionId } = view;
    const collection = collectionId ? collections?.find((c) => c.id === collectionId) ?? null : null;
    return (
      <CollectionEditView
        collection={collection}
        onCancel={() => setView(collectionId ? { kind: 'chunks', collectionId } : { kind: 'collections' })}
        onSubmit={(value) => (collectionId ? handleUpdateCollection(collectionId, value) : handleCreateCollection(value))}
      />
    );
  }

  if (view.kind === 'chunks') {
    const { collectionId } = view;
    const selected = collections?.find((c) => c.id === collectionId) ?? null;
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NavigationBar title={selected?.title ?? 'Чанки'} onBack={() => setView({ kind: 'collections' })} />
        <div className="scroll-clean flex-1 min-h-0">
          <div className="flex flex-col gap-4 px-5 py-4">
            {selected && (
              <div className="flex items-center justify-between text-meta">
                <span>
                  /{selected.slug} · {selected.level} · позиция {selected.position}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setView({ kind: 'editCollection', collectionId })}>
                  Изменить
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[14.5px] font-medium">Чанки</div>
              <div className="flex items-center gap-2 flex-wrap">
                {chunks && chunks.length > 0 && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setBulkSentencesOpen(true)}>
                      Массово обновить предложения
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setBulkAiOpen(true)}>
                      Массово через ИИ
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setBulkChunkCreateOpen(true)}>
                  Массово создать чанки
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setView({ kind: 'editChunk', collectionId, chunk: 'new' })}>
                  + Чанк
                </Button>
              </div>
            </div>
            <div className="flex flex-col">
              {chunks === null && <div className="text-body-secondary py-2">Загрузка…</div>}
              {chunks?.length === 0 && <div className="text-body-secondary py-2">В коллекции пока нет чанков.</div>}
              {chunks?.map((chunk) => (
                <div key={chunk.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] truncate">{chunk.text}</div>
                    <div className="text-meta truncate">
                      {chunk.translation} · {chunk.level}
                      {chunk.situationPrompts.length > 0 ? ` · ${chunk.situationPrompts.length} ${plural(chunk.situationPrompts.length, 'ситуация', 'ситуации', 'ситуаций')}` : ''}
                      {chunk.hasDialogue ? ' · есть диалог' : ''}
                    </div>
                  </div>
                  <IconButton icon="Delete" label="Убрать из коллекции" size="sm" tone="muted" onClick={() => handleDetachChunk(collectionId, chunk)} />
                  <DialogueQuickActions chunk={chunk} characters={characters} onSaved={() => markChunkHasDialogue(chunk.id)} />
                  <Button size="sm" variant="ghost" onClick={() => setView({ kind: 'editDialogue', collectionId, chunk })}>
                    {chunk.hasDialogue ? 'Диалог' : '+ Диалог'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setView({ kind: 'editChunk', collectionId, chunk })}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteChunk(collectionId, chunk)}>
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <BulkDialogueAiSheet
          open={bulkAiOpen}
          onOpenChange={setBulkAiOpen}
          collectionTitle={selected?.title ?? 'Чанки'}
          chunks={chunks ?? []}
          characters={characters}
          onSaved={markChunkHasDialogue}
        />
        <BulkChunkCreateAiSheet
          open={bulkChunkCreateOpen}
          onOpenChange={setBulkChunkCreateOpen}
          collectionId={collectionId}
          collectionTitle={selected?.title ?? 'Чанки'}
          level={selected?.level ?? 'A2'}
          existingChunkTexts={chunks?.map((c) => c.text) ?? []}
          onSaved={(chunk) => handleBulkChunkCreated(collectionId, chunk)}
        />
        <BulkSentencesRegenerateAiSheet
          open={bulkSentencesOpen}
          onOpenChange={setBulkSentencesOpen}
          collectionTitle={selected?.title ?? 'Чанки'}
          chunks={chunks ?? []}
          onSaved={handleBulkSentencesSaved}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Контент" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[14.5px] font-medium">Коллекции</div>
            <Button size="sm" variant="secondary" onClick={() => setView({ kind: 'editCollection' })}>
              + Коллекция
            </Button>
          </div>
          <div className="flex flex-col">
            {collections === null && <div className="text-body-secondary py-2">Загрузка…</div>}
            {collections?.length === 0 && <div className="text-body-secondary py-2">Коллекций пока нет.</div>}
            {collections?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setView({ kind: 'chunks', collectionId: c.id })}
                className="pressable flex items-center gap-3 py-3 border-b border-border last:border-b-0 text-left"
              >
                {c.bannerUrl ? (
                  <RetryImage src={apiUrl(c.bannerUrl)} alt="" className="w-12 h-9 flex-none rounded-[var(--radius-md)] object-cover" />
                ) : (
                  <div className="w-12 h-9 flex-none rounded-[var(--radius-md)] bg-surface-subtle" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] truncate">
                    {c.title}
                    {c.isPublished ? '' : ' (не опубликована)'}
                  </div>
                  <div className="text-meta truncate">
                    /{c.slug} · {c.level} · {c.chunkCount} {plural(c.chunkCount, 'чанк', 'чанка', 'чанков')}
                  </div>
                </div>
                <Icon name="ChevronForward" size={18} className="text-text-secondary flex-none" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
