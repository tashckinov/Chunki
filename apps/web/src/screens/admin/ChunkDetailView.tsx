import { useEffect, useState, type ReactNode } from 'react';
import type { AdminChunk } from '../../lib/admin';
import type { ChunkSentence, SituationPrompt } from '../../lib/collections';
import type { AdminChunkGroup } from '../../lib/chunkGroups';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Textarea } from '../../components/ui/Textarea';
import { fetchAdminDialogue } from '../../lib/dialogues';
import type { Character } from '../../lib/characters';
import { ContentJourney, answerFormat, type ContentStage } from './ContentJourney';
import { ChunkContentPreview, type PreviewMode } from './ChunkContentPreview';
import { ChunkExamplesEditor, ContentPartsEditor } from './ChunkExamplesEditor';
import { useTimedFlag } from '../../lib/timedFlag';

function StatusBadge({ ok, readyLabel, missingLabel }: { ok: boolean; readyLabel: string; missingLabel: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[12.5px] font-medium px-2 py-1 rounded-full flex-none ${ok ? 'bg-positive-subtle text-positive' : 'bg-surface-subtle text-text-tertiary'}`}>
      {ok ? `✓ ${readyLabel}` : `— ${missingLabel}`}
    </span>
  );
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="text-[15px] font-semibold">{title}</div>
          {subtitle && <div className="text-meta">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ChunkDetailView({
  chunk,
  initialStage = 'card',
  groups,
  characters,
  onSaveSentences,
  onBack,
  onEditCore,
  onOpenBrowseDialogue,
  onOpenSituationDialogue,
  onSaveSituationPrompts,
  onDetach,
  onDelete,
}: {
  chunk: AdminChunk;
  initialStage?: ContentStage;
  /** For the "ожидаемая группа" picker per scenario — see admin "Типы". */
  groups: AdminChunkGroup[];
  characters: Character[];
  onSaveSentences: (sentences: ChunkSentence[]) => Promise<void>;
  onBack: () => void;
  onEditCore: () => void;
  onOpenBrowseDialogue: () => void;
  onOpenSituationDialogue: () => void;
  onSaveSituationPrompts: (situationPrompts: SituationPrompt[]) => Promise<void>;
  onDetach: () => void;
  onDelete: () => void;
}) {
  const [stage, setStage] = useState<ContentStage>(initialStage);
  const [preview, setPreview] = useState<PreviewMode | null>(null);
  const [comicGroup, setComicGroup] = useState<string | null | undefined>();
  const [situationDraft, setSituationDraft] = useState<SituationPrompt[]>(chunk.situationPrompts);
  const [savingSituations, setSavingSituations] = useState(false);
  const [situationsSaveError, setSituationsSaveError] = useState<string | null>(null);
  const [situationsJustSaved, flashSituationsJustSaved] = useTimedFlag();

  // Keyed on chunk.id (not the chunk object) — the parent re-looks-up chunk
  // from its list state on every render, so a naive [chunk] dependency
  // would wipe an in-progress edit on unrelated re-renders.
  useEffect(() => {
    setSituationDraft(chunk.situationPrompts);
  }, [chunk.id]);

  useEffect(() => {
    if (!chunk.hasSituationDialogue) return;
    let active = true;
    fetchAdminDialogue(chunk.id, 'situation').then((dialogue) => {
      if (active && dialogue) setComicGroup(dialogue.expectedGroupId ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, [chunk.id, chunk.hasSituationDialogue]);

  async function saveSituations() {
    if (situationDraft.some((prompt) => !prompt.text.trim()
      || prompt.parts.some((part) => !part.text.trim() || !part.explanationRu.trim() || !part.explanationEn.trim()))) {
      setSituationsSaveError('Заполните текст сценария и все добавленные части.');
      return;
    }
    setSavingSituations(true);
    setSituationsSaveError(null);
    try {
      await onSaveSituationPrompts(situationDraft);
      flashSituationsJustSaved();
    } catch (err) {
      setSituationsSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSituations(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title={chunk.text} onBack={onBack} />
      <div className="scroll-clean flex-1 min-h-0 px-5 py-4">
        <div className="flex flex-col gap-4">
          <ContentJourney chunk={chunk} selected={stage} onSelect={(next) => {
            setStage(next);
            requestAnimationFrame(() => document.getElementById('chunk-stage-' + next)?.scrollIntoView({ block: 'nearest' }));
          }} />
          <div id="chunk-stage-card" className={stage === 'card' ? 'flex flex-col gap-3' : 'hidden'}>
            <SectionCard title="Карточка" action={<Button size="sm" variant="ghost" onClick={onEditCore}>Изменить</Button>}>
              <div className="flex flex-col gap-1 text-[14px]">
                <div>{chunk.text} → {chunk.translation}</div>
                {chunk.explanation && <div className="text-body-secondary">{chunk.explanation}</div>}
                <div className="text-meta">Уровень {chunk.level}</div>
              </div>
            </SectionCard>

            <SectionCard title={`Примеры на карточке (${chunk.sentences.length})`}
              subtitle="На обороте показывается один пример из сохранённых."
              action={<Button size="sm" variant="ghost" onClick={() => setPreview({ kind: 'card' })}>Предпросмотр</Button>}>
              <ChunkExamplesEditor sentences={chunk.sentences} onSave={onSaveSentences} />
            </SectionCard>
          </div>

          <div id="chunk-stage-browse" hidden={stage !== 'browse'}>
            <SectionCard
              title="После «Не знаю»"
              subtitle="Комикс с примером перед проверкой перевода. Он доступен и в галерее комиксов."
              action={<StatusBadge ok={chunk.hasDialogue} readyLabel="Готов" missingLabel="Не создан" />}
            >
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={onOpenBrowseDialogue}>Редактор комикса</Button>
                {chunk.hasDialogue && <Button size="sm" variant="ghost" onClick={() => setPreview({ kind: 'browse' })}>Предпросмотр</Button>}
              </div>
            </SectionCard>

          </div>
          <div id="chunk-stage-recognition" hidden={stage !== 'recognition'}>
            <SectionCard title="Проверка понимания">
              <p className="text-body-secondary">Ученик выбирает перевод фразы. Варианты подбираются автоматически, отдельный материал создавать не нужно.</p>
            </SectionCard>
          </div>
          <div id="chunk-stage-answer" hidden={stage !== 'answer'}>
            <SectionCard title="Проверка ответа · Ситуация"
              subtitle="После верного выбора перевода или из очереди после «Знаю»."
              action={<span className="rounded-full bg-surface-subtle px-2 py-1 text-meta">{answerFormat(chunk)}</span>}>
              <div className="text-[13px] text-body-secondary bg-accent-subtle rounded-[var(--radius-md)] px-3 py-2">
                Два способа задать содержание — используется только один: если комикс готов, учащийся увидит его; текстовый сценарий — запасной вариант на случай, если комикса нет.
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13.5px] font-medium">Комикс с пропущенной репликой</div>
                  <StatusBadge ok={chunk.hasSituationDialogue} readyLabel="Готов" missingLabel="Не создан" />
                </div>
                {chunk.hasSituationDialogue && comicGroup !== undefined && (
                  <p className="text-meta">Допустимый ответ: {comicGroup ? (groups.find((group) => group.id === comicGroup)?.name ?? 'связанная группа') : chunk.text}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={onOpenSituationDialogue}>Редактор комикса и ответов</Button>
                  {chunk.hasSituationDialogue && <Button size="sm" variant="ghost" onClick={() => setPreview({ kind: 'situation' })}>Предпросмотр</Button>}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="flex flex-col gap-2">
                <div className="text-[13.5px] font-medium">
                  {chunk.hasSituationDialogue ? 'Запасной текст' : 'Текстовый сценарий'} {situationDraft.length > 0 ? `(${situationDraft.length})` : ''}
                </div>
                <div className="text-meta">
                  Учащемуся на английском покажут один из сценариев по очереди и попросят естественно ответить, использовав фразу.
                </div>
                {chunk.situationPrompts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chunk.situationPrompts.map((prompt, index) => (
                      <Button key={index} size="sm" variant="ghost" onClick={() => setPreview({ kind: 'text', prompt })}>
                        Предпросмотр текста {index + 1}
                      </Button>
                    ))}
                  </div>
                )}
                {situationsSaveError && <div className="text-negative text-[13px]">Не удалось сохранить: {situationsSaveError}</div>}
                <div className="flex flex-col gap-2">
                  {situationDraft.map((prompt, i) => (
                    <div key={i} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border p-2.5">
                      <div className="flex items-start gap-2">
                        <Textarea
                          value={prompt.text}
                          onChange={(v) => setSituationDraft((prev) => prev.map((p, j) => (j === i ? { ...p, text: v } : p)))}
                          placeholder="A friend suggests meeting at 7pm. You're happy with that. What do you reply?"
                          rows={2}
                        />
                        <IconButton icon="Delete" label="Удалить сценарий" size="sm" tone="muted" onClick={() => setSituationDraft((prev) => prev.filter((_, j) => j !== i))} />
                      </div>
                      <ContentPartsEditor parts={prompt.parts} onChange={(parts) =>
                        setSituationDraft((prev) => prev.map((p, j) => j === i ? { ...p, parts } : p))} />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-meta">Ожидаемая группа ответов:</span>
                        <select
                          value={prompt.expectedGroupId ?? ''}
                          onChange={(e) =>
                            setSituationDraft((prev) => prev.map((p, j) => (j === i ? { ...p, expectedGroupId: e.target.value || null } : p)))
                          }
                          className="rounded-[var(--radius-sm)] bg-surface-subtle px-2 py-1 text-[13px] outline-none"
                        >
                          <option value="">Только эта фраза</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" className="self-start" disabled={situationDraft.length >= 50 || savingSituations} onClick={() => setSituationDraft((prev) => [...prev, { text: '', parts: [], expectedGroupId: null }])}>
                    + Добавить сценарий
                  </Button>
                </div>
                <Button size="sm" onClick={saveSituations} disabled={savingSituations} className="self-start">
                  {savingSituations ? 'Сохраняем…' : situationsJustSaved ? 'Сохранено' : 'Сохранить сценарии'}
                </Button>
              </div>
            </SectionCard>

          </div>

          <div className="flex flex-col gap-1 pt-2">
            <Button variant="ghost" size="sm" onClick={onDetach} className="self-start">
              Убрать из этой коллекции
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="self-start text-negative">
              Удалить чанк навсегда
            </Button>
          </div>
        </div>
      </div>
      {preview && <ChunkContentPreview chunk={chunk} characters={characters} mode={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
