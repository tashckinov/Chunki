import { useEffect, useMemo, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { useTimedFlag } from '../../lib/timedFlag';
import {
  fetchChunkGroups,
  createChunkGroup,
  updateChunkGroup,
  deleteChunkGroup,
  fetchChunksWithGroups,
  setChunkGroups,
  applyChunkClassification,
  type AdminChunkGroup,
  type AdminChunkWithGroups,
  type ApplyClassificationResult,
} from '../../lib/chunkGroups';
import { buildChunkClassificationPrompt } from '../../lib/chunkGroupAiPrompt';
import { parseChunkClassificationImport } from '../../lib/chunkGroupImport';

/** One existing group's editor — key/name/description, dirty-tracked save, delete. Same pattern as PaymentsSection.tsx's TariffEditor. */
function GroupEditor({ group, onSaved, onDeleted }: { group: AdminChunkGroup; onSaved: (updated: AdminChunkGroup) => void; onDeleted: (id: string) => void }) {
  const [key, setKey] = useState(group.key);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, saveFlash] = useTimedFlag();

  const dirty = key !== group.key || name !== group.name || description !== (group.description ?? '');

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChunkGroup(group.id, { key: key.trim(), name: name.trim(), description: description.trim() || null });
      onSaved(updated);
      saveFlash();
    } catch {
      setError('Не удалось сохранить — возможно, такой ключ уже занят.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteChunkGroup(group.id);
      onDeleted(group.id);
    } catch {
      setError('Не удалось удалить.');
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-meta mb-1.5">Ключ (key)</div>
          <Input value={key} onChange={setKey} placeholder="accepting_suggestion" />
        </div>
        <div>
          <div className="text-meta mb-1.5">Название</div>
          <Input value={name} onChange={setName} placeholder="Согласие с предложением" />
        </div>
      </div>
      <div>
        <div className="text-meta mb-1.5">Описание (необязательно)</div>
        <Textarea value={description} onChange={setDescription} placeholder="Какие фразы сюда относятся" rows={2} />
      </div>
      <div className="text-meta">Чанков в группе: {group.memberCount}</div>
      {error && <div className="text-negative text-[13.5px]">{error}</div>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || deleting || !dirty}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} disabled={saving || deleting}>
          {deleting ? 'Удаляем…' : 'Удалить'}
        </Button>
        {!dirty && savedJustNow && <span className="text-positive text-[13px]">Сохранено ✓</span>}
      </div>
    </div>
  );
}

function NewGroupForm({ onCreated }: { onCreated: (created: AdminChunkGroup) => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const created = await createChunkGroup({ key: key.trim(), name: name.trim(), description: description.trim() || null });
      onCreated(created);
      setKey('');
      setName('');
      setDescription('');
    } catch {
      setError('Не удалось создать — возможно, такой ключ уже занят.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border p-4 flex flex-col gap-3">
      <div className="text-[14.5px] font-semibold">Новая группа</div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={key} onChange={setKey} placeholder="ключ (snake_case)" />
        <Input value={name} onChange={setName} placeholder="Название" />
      </div>
      <Textarea value={description} onChange={setDescription} placeholder="Описание (необязательно)" rows={2} />
      {error && <div className="text-negative text-[13.5px]">{error}</div>}
      <Button size="sm" variant="secondary" onClick={create} disabled={creating || !key.trim() || !name.trim()} className="self-start">
        {creating ? 'Создаём…' : 'Создать группу'}
      </Button>
    </div>
  );
}

/** One chunk's group membership — a checkbox per existing group, dirty-tracked save (same shape as the tariff upsell picker). */
function ChunkGroupsRow({ chunk, groups, onSaved }: { chunk: AdminChunkWithGroups; groups: AdminChunkGroup[]; onSaved: (chunkId: string, groupIds: string[]) => void }) {
  const [draft, setDraft] = useState<string[]>(chunk.groupIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, saveFlash] = useTimedFlag();

  const dirty = draft.length !== chunk.groupIds.length || draft.some((id) => !chunk.groupIds.includes(id));

  function toggle(id: string) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setChunkGroups(chunk.id, draft);
      onSaved(chunk.id, draft);
      saveFlash();
    } catch {
      setError('Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3.5 flex flex-col gap-2.5">
      <div>
        <div className="text-[14.5px] font-medium">{chunk.text}</div>
        <div className="text-meta">{chunk.translation}</div>
      </div>
      {groups.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-1.5 text-[13.5px]">
              <input type="checkbox" checked={draft.includes(g.id)} onChange={() => toggle(g.id)} />
              {g.name}
            </label>
          ))}
        </div>
      ) : (
        <div className="text-meta">Групп пока нет — создайте хотя бы одну выше.</div>
      )}
      {error && <div className="text-negative text-[13px]">{error}</div>}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {!dirty && savedJustNow && <span className="text-positive text-[13px]">Сохранено ✓</span>}
      </div>
    </div>
  );
}

/** Copy-prompt / paste-JSON / review / apply — same round-trip shape as ContentSection.tsx's bulk-AI sheets, but with a review step before writing anything (the AI proposes, the admin applies). */
function ClassifyAiSheet({
  open,
  onOpenChange,
  chunks,
  groups,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chunks: AdminChunkWithGroups[];
  groups: AdminChunkGroup[];
  onApplied: () => void;
}) {
  const [copied, flashCopied] = useTimedFlag();
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ newGroups: { key: string; name: string; description: string | null }[]; assignments: { chunkId: string; groupKeys: string[] }[] } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyClassificationResult | null>(null);

  const groupNameByKey = useMemo(() => new Map(groups.map((g) => [g.key, g.name])), [groups]);
  const chunkTextById = useMemo(() => new Map(chunks.map((c) => [c.id, c.text])), [chunks]);

  async function copy() {
    await navigator.clipboard.writeText(buildChunkClassificationPrompt(chunks, groups));
    flashCopied();
  }

  function handleParse() {
    const knownChunkIds = new Set(chunks.map((c) => c.id));
    const knownGroupKeys = new Set(groups.map((g) => g.key));
    const result = parseChunkClassificationImport(importText, knownChunkIds, knownGroupKeys);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    setImportError(null);
    setApplyResult(null);
    setPreview(result.input);
  }

  async function apply() {
    if (!preview) return;
    setApplying(true);
    try {
      const result = await applyChunkClassification(preview);
      setApplyResult(result);
      onApplied();
    } catch {
      setImportError('Не удалось применить классификацию.');
    } finally {
      setApplying(false);
    }
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
    setApplyResult(null);
  }

  return (
    <Sheet open={open} onOpenChange={closeSheet} title="Массовая классификация через ИИ">
      {!preview ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] text-body-secondary">
            Скопируйте инструкцию (весь список чанков и групп), запустите её во внешнем ИИ-чате, затем вставьте ответ ниже.
          </div>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? 'Скопировано' : `Копировать инструкцию (${chunks.length} ${chunks.length === 1 ? 'чанк' : 'чанков'})`}
          </Button>
          <Textarea
            value={importText}
            onChange={(v) => {
              setImportText(v);
              setImportError(null);
            }}
            placeholder='{"newGroups": [...], "assignments": [...]}'
            rows={10}
          />
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <Button size="sm" onClick={handleParse} disabled={!importText.trim()}>
            Вставить и посмотреть
          </Button>
        </div>
      ) : applyResult ? (
        <div className="flex flex-col gap-3">
          <div className="text-[14.5px] font-semibold">Готово</div>
          <div className="text-[13.5px] text-body-secondary">
            Создано новых групп: {applyResult.createdGroups.length}. Обновлена классификация у {applyResult.updatedChunkCount} {applyResult.updatedChunkCount === 1 ? 'чанка' : 'чанков'}.
            {applyResult.skippedGroupKeys.length > 0 && ` Пропущены неизвестные ключи групп: ${applyResult.skippedGroupKeys.join(', ')}.`}
          </div>
          <Button size="sm" onClick={() => closeSheet(false)}>
            Закрыть
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {preview.newGroups.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[14.5px] font-semibold">Новые группы ({preview.newGroups.length})</div>
              {preview.newGroups.map((g) => (
                <div key={g.key} className="rounded-[var(--radius-md)] border border-border p-3 text-[13.5px]">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-meta">{g.key}</div>
                  {g.description && <div className="text-body-secondary mt-1">{g.description}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 max-h-[35vh] overflow-y-auto">
            <div className="text-[14.5px] font-semibold">Изменения классификации ({preview.assignments.length})</div>
            {preview.assignments.map((a) => (
              <div key={a.chunkId} className="rounded-[var(--radius-md)] border border-border p-3 text-[13.5px] flex items-center justify-between gap-2">
                <span>{chunkTextById.get(a.chunkId) ?? a.chunkId}</span>
                <span className="text-meta text-right">
                  {a.groupKeys.length > 0 ? a.groupKeys.map((k) => groupNameByKey.get(k) ?? k).join(', ') : 'без группы'}
                </span>
              </div>
            ))}
          </div>
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={apply} disabled={applying}>
              {applying ? 'Применяем…' : 'Применить'}
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

export function ChunkGroupsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [groups, setGroups] = useState<AdminChunkGroup[] | null>(null);
  const [chunks, setChunks] = useState<AdminChunkWithGroups[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [classifyOpen, setClassifyOpen] = useState(false);

  function reload() {
    fetchChunkGroups()
      .then(setGroups)
      .catch(() => setError('Не удалось загрузить группы.'));
    fetchChunksWithGroups()
      .then(setChunks)
      .catch(() => setError('Не удалось загрузить чанки.'));
  }

  useEffect(reload, []);

  const filteredChunks = useMemo(() => {
    if (!chunks) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return chunks;
    return chunks.filter((c) => c.text.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q));
  }, [chunks, filter]);

  function handleGroupSaved(updated: AdminChunkGroup) {
    setGroups((prev) => (prev ? prev.map((g) => (g.id === updated.id ? updated : g)) : prev));
  }

  function handleGroupCreated(created: AdminChunkGroup) {
    setGroups((prev) => (prev ? [...prev, created] : [created]));
  }

  function handleGroupDeleted(id: string) {
    setGroups((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
    setChunks((prev) => (prev ? prev.map((c) => ({ ...c, groupIds: c.groupIds.filter((g) => g !== id) })) : prev));
  }

  function handleChunkGroupsSaved(chunkId: string, groupIds: string[]) {
    setChunks((prev) => (prev ? prev.map((c) => (c.id === chunkId ? { ...c, groupIds } : c)) : prev));
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Типы" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[15px] font-semibold">Смысловые группы</div>
            {chunks && groups && (
              <Button size="sm" variant="secondary" onClick={() => setClassifyOpen(true)}>
                Классифицировать через ИИ
              </Button>
            )}
          </div>
          <div className="text-[13.5px] text-body-secondary">
            Чанки в одной группе (например «sounds good», «I'm in», «let's do it») считаются взаимозаменяемыми ответами на ситуацию — если ситуация связана с этой группой, подходящим считается ответ с любым из этих чанков.
          </div>
          {error && <div className="text-negative">{error}</div>}
          {!error && !groups && <div className="text-body-secondary">Загрузка…</div>}
          {groups?.map((g) => <GroupEditor key={g.id} group={g} onSaved={handleGroupSaved} onDeleted={handleGroupDeleted} />)}
          <NewGroupForm onCreated={handleGroupCreated} />
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 border-t border-border">
          <div className="text-[15px] font-semibold">Чанки</div>
          <Input value={filter} onChange={setFilter} placeholder="Поиск по тексту или переводу" />
          {!error && !filteredChunks && <div className="text-body-secondary">Загрузка…</div>}
          {filteredChunks?.length === 0 && <div className="text-body-secondary">Ничего не найдено.</div>}
          {filteredChunks?.map((c) => <ChunkGroupsRow key={c.id} chunk={c} groups={groups ?? []} onSaved={handleChunkGroupsSaved} />)}
        </div>
      </div>

      {chunks && groups && <ClassifyAiSheet open={classifyOpen} onOpenChange={setClassifyOpen} chunks={chunks} groups={groups} onApplied={reload} />}
    </div>
  );
}
