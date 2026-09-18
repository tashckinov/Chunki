import { useEffect, useState, type ReactNode } from 'react';
import type { AdminChunk } from '../../lib/admin';
import type { SituationPrompt } from '../../lib/collections';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Textarea } from '../../components/ui/Textarea';

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
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-semibold">{title}</div>
          {subtitle && <div className="text-meta">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Chunk content hub — replaces the old wall of 9 buttons per list row with
 * one place that explains, for THIS chunk, what learner-facing content
 * exists and where it's edited. In particular the "Ситуация" card exists to
 * fix the confusion between the two unrelated things previously both
 * labelled "ситуация": text scenarios (chunk_situation_prompts) and the
 * "Комикс-ситуация" (a chunk_dialogues kind='situation' comic) — they're
 * actually two alternative ways to author ONE exercise, and this card says
 * so explicitly (mirrors buildProductionCheck's real priority on the server).
 */
export function ChunkDetailView({
  chunk,
  onBack,
  onEditCore,
  onOpenBrowseDialogue,
  onOpenSituationDialogue,
  onSaveSituationPrompts,
  onDetach,
  onDelete,
}: {
  chunk: AdminChunk;
  onBack: () => void;
  onEditCore: () => void;
  onOpenBrowseDialogue: () => void;
  onOpenSituationDialogue: () => void;
  onSaveSituationPrompts: (situationPrompts: SituationPrompt[]) => Promise<void>;
  onDetach: () => void;
  onDelete: () => void;
}) {
  const [situationDraft, setSituationDraft] = useState<SituationPrompt[]>(chunk.situationPrompts);
  const [savingSituations, setSavingSituations] = useState(false);
  const [situationsSaveError, setSituationsSaveError] = useState<string | null>(null);
  const [situationsJustSaved, setSituationsJustSaved] = useState(false);

  // Keyed on chunk.id (not the chunk object) — the parent re-looks-up chunk
  // from its list state on every render, so a naive [chunk] dependency
  // would wipe an in-progress edit on unrelated re-renders.
  useEffect(() => {
    setSituationDraft(chunk.situationPrompts);
  }, [chunk.id]);

  async function saveSituations() {
    setSavingSituations(true);
    setSituationsSaveError(null);
    try {
      await onSaveSituationPrompts(situationDraft);
      setSituationsJustSaved(true);
      setTimeout(() => setSituationsJustSaved(false), 1500);
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
          <SectionCard title="Карточка" action={<Button size="sm" variant="ghost" onClick={onEditCore}>Изменить</Button>}>
            <div className="flex flex-col gap-1 text-[14px]">
              <div>{chunk.text} → {chunk.translation}</div>
              {chunk.explanation && <div className="text-body-secondary">{chunk.explanation}</div>}
              <div className="text-meta">Уровень {chunk.level}</div>
            </div>
          </SectionCard>

          <SectionCard title={`Примеры предложений (${chunk.sentences.length})`} subtitle="Меняются через «Массово через ИИ» на экране списка чанков, не здесь.">
            {chunk.sentences.length > 0 ? (
              <div className="text-[14px] text-text-secondary">{chunk.sentences[0].text}</div>
            ) : (
              <div className="text-meta">Пока нет предложений.</div>
            )}
          </SectionCard>

          <SectionCard
            title="Комикс «Не знаю»"
            subtitle="Показывается, когда пользователь свайпает «Не знаю»."
            action={<StatusBadge ok={chunk.hasDialogue} readyLabel="Готов" missingLabel="Не создан" />}
          >
            <Button size="sm" variant="secondary" onClick={onOpenBrowseDialogue} className="self-start">
              Открыть редактор
            </Button>
          </SectionCard>

          <SectionCard title="Ситуация" subtitle="Показывается, когда пользователь свайпает «Знаю».">
            <div className="text-[13px] text-body-secondary bg-accent-subtle rounded-[var(--radius-md)] px-3 py-2">
              Два способа задать содержание — используется только один: если комикс готов, учащийся увидит его; текстовый сценарий — запасной вариант на случай, если комикса нет.
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13.5px] font-medium">Комикс с пропущенной репликой</div>
                <StatusBadge ok={chunk.hasSituationDialogue} readyLabel="Готов" missingLabel="Не создан" />
              </div>
              <Button size="sm" variant="secondary" onClick={onOpenSituationDialogue} className="self-start">
                Открыть редактор
              </Button>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <div className="text-[13.5px] font-medium">
                Текстовый сценарий {situationDraft.length > 0 ? `(${situationDraft.length})` : ''}
              </div>
              <div className="text-meta">
                Учащемуся на английском покажут один из сценариев по очереди и попросят естественно ответить, использовав фразу.
              </div>
              {situationsSaveError && <div className="text-negative text-[13px]">Не удалось сохранить: {situationsSaveError}</div>}
              <div className="flex flex-col gap-2">
                {situationDraft.map((prompt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Textarea
                      value={prompt.text}
                      onChange={(v) => setSituationDraft((prev) => prev.map((p, j) => (j === i ? { ...p, text: v } : p)))}
                      placeholder="A friend suggests meeting at 7pm. You're happy with that. What do you reply?"
                      rows={2}
                    />
                    <IconButton icon="Delete" label="Удалить сценарий" size="sm" tone="muted" onClick={() => setSituationDraft((prev) => prev.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button variant="secondary" size="sm" className="self-start" onClick={() => setSituationDraft((prev) => [...prev, { text: '', parts: [] }])}>
                  + Добавить сценарий
                </Button>
              </div>
              <Button size="sm" onClick={saveSituations} disabled={savingSituations} className="self-start">
                {savingSituations ? 'Сохраняем…' : situationsJustSaved ? 'Сохранено' : 'Сохранить сценарии'}
              </Button>
            </div>
          </SectionCard>

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
    </div>
  );
}
