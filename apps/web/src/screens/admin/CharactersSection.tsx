import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { plural } from '../../lib/plural';
import { apiUrl, ApiError } from '../../lib/collections';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { Icon } from '../../components/ui/Icon';
import { Chip } from '../../components/ui/Chip';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Sheet';
import {
  fetchCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  uploadFullBodyImage,
  uploadCharacterImages,
  moveCharacterImageToEmotion,
  updateCharacterImageDescription,
  reorderCharacterImages,
  deleteCharacterImage,
  fetchCharacterUsage,
  type Character,
  type CharacterImage,
  type CharacterChunkUsage,
} from '../../lib/characters';
import { EMOTION_SUGGESTIONS, emotionLabel, groupImagesByEmotion } from '../../lib/characterEmotions';
import { DialogueBuilderView } from './DialogueBuilderView';

/** Persistent label + optional hint — same convention as ContentSection.tsx's Field. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-meta">{hint}</span>}
    </label>
  );
}

/** Bold, accent-colored trailing nav-bar action — same as ContentSection.tsx's SaveButton. */
function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pressable flex-none text-[14.5px] font-semibold text-accent disabled:opacity-50 px-2">
      {saving ? 'Сохраняем…' : 'Сохранить'}
    </button>
  );
}

type CharactersView =
  | { kind: 'list' }
  | { kind: 'detail'; characterId: string }
  | { kind: 'create' }
  | { kind: 'dialogue'; characterId: string; chunkId: string; chunkText: string; chunkTranslation: string };

function CharacterCreateView({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Новый персонаж" onBack={onCancel} trailing={<SaveButton onClick={save} saving={saving} disabled={saving || !name.trim()} />} />
      <div className="scroll-clean flex-1 min-h-0 px-5 py-4">
        <div className="flex flex-col gap-4">
          {error && <div className="text-negative text-[13px]">Не удалось сохранить: {error}</div>}
          <Field label="Имя" hint="Например Mia, Leo, Sofia — так, как оно будет видно в редакторе диалога.">
            <Input value={name} onChange={setName} placeholder="Mia" />
          </Field>
          <div className="text-meta">После создания вы сможете загрузить фото персонажа в полный рост и добавить эмоции.</div>
        </div>
      </div>
    </div>
  );
}

function CharacterListCard({ character, onClick }: { character: Character; onClick: () => void }) {
  const groups = groupImagesByEmotion(character.images);
  return (
    <Card variant="surface" onClick={onClick} className="border border-border overflow-hidden flex flex-col">
      <div className="aspect-[3/4] w-full bg-surface-subtle overflow-hidden flex items-center justify-center">
        {character.fullBodyImageUrl ? (
          <img src={apiUrl(character.fullBodyImageUrl)} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon name="Characters" size={36} className="text-text-tertiary" />
        )}
      </div>
      <div className="p-3.5 flex flex-col gap-1">
        <div className="text-[14.5px] font-semibold truncate">{character.name}</div>
        <div className="text-meta truncate">
          {groups.length === 0 ? 'Нет эмоций' : groups.map(([emotion, images]) => `${emotionLabel(emotion)} [${images.length}]`).join(' · ')}
        </div>
      </div>
    </Card>
  );
}

function EmotionImageTile({
  image,
  onMove,
  onDelete,
  onEditDescription,
}: {
  image: CharacterImage;
  onMove: () => void;
  onDelete: () => void;
  onEditDescription: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div className="flex flex-col items-center gap-0.5 flex-none w-20">
      <div ref={setNodeRef} style={style} className="relative w-20 h-20 rounded-[var(--radius-md)] overflow-hidden bg-surface-subtle">
        <img src={apiUrl(image.imageUrl)} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center touch-none cursor-grab text-text-secondary"
          aria-label="Перетащить"
        >
          <Icon name="Grip" size={12} />
        </button>
        <button
          type="button"
          onClick={onMove}
          className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center text-[11px] text-text-secondary"
          aria-label="Переместить в другую эмоцию"
        >
          ⇄
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center text-text-secondary"
          aria-label="Удалить изображение"
        >
          <Icon name="Close" size={12} />
        </button>
        <button
          type="button"
          onClick={onEditDescription}
          className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center text-text-secondary"
          aria-label="Описание изображения"
        >
          <Icon name="Edit" size={11} />
        </button>
      </div>
      {image.description && <div className="text-[10px] text-text-tertiary text-center truncate w-full">{image.description}</div>}
    </div>
  );
}

function EmotionGroup({
  emotion,
  images,
  onReordered,
  onMove,
  onDelete,
  onEditDescription,
}: {
  emotion: string;
  images: CharacterImage[];
  onReordered: (emotion: string, imageIds: string[]) => void;
  onMove: (image: CharacterImage) => void;
  onDelete: (image: CharacterImage) => void;
  onEditDescription: (image: CharacterImage) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReordered(emotion, arrayMove(images, oldIndex, newIndex).map((i) => i.id));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[13px] font-medium text-text-secondary">
        {emotionLabel(emotion)} · {images.length}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={images.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image) => (
              <EmotionImageTile key={image.id} image={image} onMove={() => onMove(image)} onDelete={() => onDelete(image)} onEditDescription={() => onEditDescription(image)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/** Fetches once which chunks' dialogues actually use this character — surfaced so the admin can see the impact before deleting one, and jump straight into editing that dialogue. */
function CharacterUsageRow({ characterId, onOpen }: { characterId: string; onOpen: (usage: CharacterChunkUsage) => void }) {
  const [usage, setUsage] = useState<CharacterChunkUsage[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setUsage('loading');
    fetchCharacterUsage(characterId)
      .then(setUsage)
      .catch(() => setUsage('error'));
  }, [characterId]);

  if (usage === 'loading') return <div className="text-body-secondary text-[13.5px]">Загрузка…</div>;

  // Never render "не используется" for a failed fetch — that would misleadingly
  // suggest it's safe to delete an image/character that might actually be in use.
  if (usage === 'error') {
    return <div className="text-negative text-[13px]">Не удалось проверить использование — не полагайтесь на пустой список ниже.</div>;
  }

  if (usage.length === 0) {
    return <div className="text-meta">Не используется ни в одном диалоге.</div>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {usage.map((u) => (
        <button key={u.chunkId} type="button" onClick={() => onOpen(u)} className="pressable text-[13.5px] text-left text-accent underline underline-offset-2">
          {u.chunkText}
          {u.collectionTitles.length > 0 && <span className="text-meta no-underline"> · {u.collectionTitles.join(', ')}</span>}
        </button>
      ))}
    </div>
  );
}

function CharacterDetailView({
  character,
  onBack,
  onUpdate,
  onDelete,
  onOpenDialogue,
}: {
  character: Character;
  onBack: () => void;
  onUpdate: (character: Character) => void;
  onDelete: () => void;
  onOpenDialogue: (usage: CharacterChunkUsage) => void;
}) {
  const [name, setName] = useState(character.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [fullBodyUploading, setFullBodyUploading] = useState(false);
  const [fullBodyError, setFullBodyError] = useState<string | null>(null);
  const [fullBodyDragOver, setFullBodyDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [pendingEmotions, setPendingEmotions] = useState<(string | null)[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [assignEmotion, setAssignEmotion] = useState('');
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [movingImage, setMovingImage] = useState<CharacterImage | null>(null);
  const [moveEmotion, setMoveEmotion] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingDescriptionImage, setEditingDescriptionImage] = useState<CharacterImage | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  useEffect(() => setName(character.name), [character.id, character.name]);
  useEffect(() => setMoveEmotion(movingImage?.emotion ?? ''), [movingImage]);
  useEffect(() => {
    setDescriptionDraft(editingDescriptionImage?.description ?? '');
    setDescriptionError(null);
  }, [editingDescriptionImage]);
  // Revokes the previous batch's object URLs whenever a new one replaces them, and on unmount.
  useEffect(() => () => pendingPreviews.forEach((url) => URL.revokeObjectURL(url)), [pendingPreviews]);

  async function saveName() {
    if (!name.trim() || name.trim() === character.name) return;
    setNameSaving(true);
    try {
      const updated = await updateCharacter(character.id, { name: name.trim() });
      onUpdate(updated);
    } catch {
      setName(character.name);
    } finally {
      setNameSaving(false);
    }
  }

  async function handleFullBodyFile(file: File) {
    setFullBodyUploading(true);
    setFullBodyError(null);
    try {
      const updated = await uploadFullBodyImage(character.id, file);
      onUpdate(updated);
    } catch {
      setFullBodyError('Не удалось загрузить фото.');
    } finally {
      setFullBodyUploading(false);
    }
  }

  function handleFilesPicked(files: File[]) {
    if (files.length === 0) return;
    setPendingFiles(files);
    setPendingPreviews(files.map((f) => URL.createObjectURL(f)));
    setPendingEmotions(files.map(() => null));
    setSelectedIndices(new Set());
    setAssignEmotion('');
    setUploadError(null);
  }

  function clearPendingBatch() {
    setPendingFiles(null);
    setPendingPreviews([]);
    setPendingEmotions([]);
    setSelectedIndices(new Set());
  }

  function toggleSelected(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /** Assigns one emotion to every currently-selected pending photo at once — select a group, tap an emotion, repeat for the next group. */
  function assignToSelected(emotion: string) {
    if (selectedIndices.size === 0 || !emotion.trim()) return;
    setPendingEmotions((prev) => prev.map((e, i) => (selectedIndices.has(i) ? emotion.trim() : e)));
    setSelectedIndices(new Set());
    setAssignEmotion('');
  }

  async function confirmBatchUpload() {
    if (!pendingFiles || pendingEmotions.some((e) => !e)) return;
    setUploadingBatch(true);
    setUploadError(null);
    try {
      const groups = new Map<string, File[]>();
      pendingFiles.forEach((file, i) => {
        const emotion = pendingEmotions[i]!;
        const list = groups.get(emotion) ?? [];
        list.push(file);
        groups.set(emotion, list);
      });
      const newImages: CharacterImage[] = [];
      for (const [emotion, files] of groups) {
        newImages.push(...(await uploadCharacterImages(character.id, emotion, files)));
      }
      onUpdate({ ...character, images: [...character.images, ...newImages] });
      clearPendingBatch();
    } catch {
      setUploadError('Не удалось загрузить изображения.');
    } finally {
      setUploadingBatch(false);
    }
  }

  async function handleReordered(emotion: string, imageIds: string[]) {
    const others = character.images.filter((i) => i.emotion !== emotion);
    const reordered = imageIds.map((id, index) => {
      const image = character.images.find((i) => i.id === id)!;
      return { ...image, position: index };
    });
    onUpdate({ ...character, images: [...others, ...reordered] });
    try {
      await reorderCharacterImages(character.id, emotion, imageIds);
    } catch {
      // Best-effort — the optimistic order stays; a reload re-syncs from the server if this failed.
    }
  }

  async function confirmMove() {
    if (!movingImage || !moveEmotion.trim()) return;
    setMoveError(null);
    try {
      const moved = await moveCharacterImageToEmotion(character.id, movingImage.id, moveEmotion.trim());
      onUpdate({ ...character, images: character.images.map((i) => (i.id === moved.id ? moved : i)) });
      setMovingImage(null);
    } catch {
      setMoveError('Не удалось переместить изображение.');
    }
  }

  async function confirmDescription() {
    if (!editingDescriptionImage) return;
    setDescriptionSaving(true);
    setDescriptionError(null);
    try {
      const updated = await updateCharacterImageDescription(character.id, editingDescriptionImage.id, descriptionDraft.trim() || null);
      onUpdate({ ...character, images: character.images.map((i) => (i.id === updated.id ? updated : i)) });
      setEditingDescriptionImage(null);
    } catch {
      setDescriptionError('Не удалось сохранить описание.');
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function handleDeleteImage(image: CharacterImage) {
    setDeleteError(null);
    try {
      await deleteCharacterImage(character.id, image.id);
      onUpdate({ ...character, images: character.images.filter((i) => i.id !== image.id) });
    } catch (err) {
      setDeleteError(err instanceof ApiError && err.status === 409 ? 'Это изображение используется в диалоге — сначала замените его там.' : 'Не удалось удалить изображение.');
    }
  }

  const groups = groupImagesByEmotion(character.images);
  const existingEmotions = [...new Set(character.images.map((i) => i.emotion))];
  const emotionChoices = [...new Set([...EMOTION_SUGGESTIONS, ...existingEmotions])];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title={character.name} onBack={onBack} />
      <div className="scroll-clean flex-1 min-h-0 px-5 py-4">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={setName} placeholder="Имя" />
            {name.trim() && name.trim() !== character.name && (
              <Button size="sm" variant="secondary" onClick={saveName} disabled={nameSaving}>
                {nameSaving ? '…' : 'Сохранить'}
              </Button>
            )}
          </div>

          <Field label="Фото в полный рост">
            <div className="flex flex-col gap-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setFullBodyDragOver(true);
                }}
                onDragLeave={() => setFullBodyDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setFullBodyDragOver(false);
                  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
                  if (file) void handleFullBodyFile(file);
                }}
                className={`aspect-[3/4] w-full max-w-[200px] rounded-[var(--radius-md)] bg-surface-subtle overflow-hidden flex items-center justify-center transition-colors ${
                  fullBodyDragOver ? 'ring-2 ring-accent' : ''
                }`}
              >
                {character.fullBodyImageUrl ? (
                  <img src={apiUrl(character.fullBodyImageUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-meta px-3 text-center">Нет фото — перетащите сюда или выберите файл</span>
                )}
              </div>
              <label className="pressable inline-flex items-center self-start rounded-[var(--radius-md)] bg-surface-subtle px-4 py-2 text-[13.5px] font-medium cursor-pointer">
                {fullBodyUploading ? 'Загружаем…' : character.fullBodyImageUrl ? 'Заменить фото' : 'Загрузить фото'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={fullBodyUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFullBodyFile(file);
                  }}
                />
              </label>
              {fullBodyError && <span className="text-negative text-[13px]">{fullBodyError}</span>}
            </div>
          </Field>

          <div className="flex flex-col gap-4">
            <div className="text-[14.5px] font-medium">Эмоции</div>
            {deleteError && <div className="text-negative text-[13px]">{deleteError}</div>}
            {groups.length === 0 && <div className="text-body-secondary text-[13.5px]">Пока нет ни одной эмоции — добавьте изображения ниже.</div>}
            {groups.map(([emotion, images]) => (
              <EmotionGroup
                key={emotion}
                emotion={emotion}
                images={images}
                onReordered={handleReordered}
                onMove={setMovingImage}
                onDelete={handleDeleteImage}
                onEditDescription={setEditingDescriptionImage}
              />
            ))}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesPicked(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')));
            }}
            className="rounded-[var(--radius-md)] border border-dashed border-border p-5 flex flex-col items-center gap-2 text-center"
          >
            <div className="text-[13.5px] text-text-secondary">Перетащите изображения сюда или выберите файлы</div>
            <label className="pressable inline-flex items-center rounded-[var(--radius-md)] bg-surface-subtle px-4 py-2 text-[13.5px] font-medium cursor-pointer">
              Выбрать файлы
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  handleFilesPicked(files);
                }}
              />
            </label>
          </div>

          {pendingFiles && (
            <div className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13.5px] font-medium">
                  {pendingFiles.length} {plural(pendingFiles.length, 'изображение', 'изображения', 'изображений')}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIndices(selectedIndices.size === pendingFiles.length ? new Set() : new Set(pendingFiles.map((_, i) => i)))}
                  className="text-[13px] text-accent underline"
                >
                  {selectedIndices.size === pendingFiles.length ? 'Снять выделение' : 'Выбрать все'}
                </button>
              </div>

              <div className="grid grid-cols-4 min-[480px]:grid-cols-5 gap-2">
                {pendingPreviews.map((src, i) => {
                  const selected = selectedIndices.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleSelected(i)}
                      className={`relative aspect-square rounded-[var(--radius-md)] overflow-hidden ${selected ? 'ring-2 ring-accent' : ''}`}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      {selected && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-on-accent flex items-center justify-center">
                          <Icon name="Check" size={10} />
                        </span>
                      )}
                      {pendingEmotions[i] && (
                        <span className="absolute bottom-0 inset-x-0 bg-surface/90 text-[10px] leading-tight text-center truncate px-0.5 py-0.5">
                          {emotionLabel(pendingEmotions[i]!)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="text-[13px] text-text-secondary">
                {selectedIndices.size > 0 ? `Выбрано: ${selectedIndices.size} — нажмите эмоцию, чтобы присвоить` : 'Выделите несколько фото, затем нажмите эмоцию — она присвоится всем выбранным.'}
              </div>
              <div className="flex gap-2 flex-wrap">
                {emotionChoices.map((e) => (
                  <Chip key={e} selected={false} onClick={() => assignToSelected(e)}>
                    {emotionLabel(e)}
                  </Chip>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input value={assignEmotion} onChange={setAssignEmotion} placeholder="Своя эмоция" />
                <Button size="sm" variant="secondary" onClick={() => assignToSelected(assignEmotion)} disabled={!assignEmotion.trim() || selectedIndices.size === 0}>
                  Присвоить
                </Button>
              </div>

              {uploadError && <div className="text-negative text-[13px]">{uploadError}</div>}
              {pendingEmotions.some((e) => !e) && (
                <div className="text-meta">Без эмоции осталось: {pendingEmotions.filter((e) => !e).length}</div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={confirmBatchUpload} disabled={uploadingBatch || pendingEmotions.some((e) => !e)}>
                  {uploadingBatch ? 'Загружаем…' : 'Добавить'}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearPendingBatch}>
                  Отмена
                </Button>
              </div>
            </div>
          )}

          <Field label="Используется в чанках" hint="Диалоги, в которых участвует этот персонаж — проверьте перед удалением.">
            <CharacterUsageRow characterId={character.id} onOpen={onOpenDialogue} />
          </Field>

          <Button variant="ghost" size="sm" onClick={onDelete} className="self-start text-negative">
            Удалить персонажа
          </Button>
        </div>
      </div>

      <Sheet open={!!movingImage} onOpenChange={(open) => !open && setMovingImage(null)} title="Переместить в эмоцию">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {emotionChoices.map((e) => (
              <Chip key={e} selected={moveEmotion === e} onClick={() => setMoveEmotion(e)}>
                {emotionLabel(e)}
              </Chip>
            ))}
          </div>
          <Input value={moveEmotion} onChange={setMoveEmotion} placeholder="Или впишите свою эмоцию" />
          {moveError && <div className="text-negative text-[13px]">{moveError}</div>}
          <Button size="sm" onClick={confirmMove} disabled={!moveEmotion.trim()}>
            Переместить
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!editingDescriptionImage} onOpenChange={(open) => !open && setEditingDescriptionImage(null)} title="Описание изображения">
        <div className="flex flex-col gap-3">
          <div className="text-meta">Помогает ИИ выбрать нужный вариант, когда у одной эмоции несколько изображений (например «good» и «bad»).</div>
          <Input value={descriptionDraft} onChange={setDescriptionDraft} placeholder="Например: искренне рада" />
          {descriptionError && <div className="text-negative text-[13px]">{descriptionError}</div>}
          <Button size="sm" onClick={confirmDescription} disabled={descriptionSaving}>
            {descriptionSaving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export function CharactersSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CharactersView>({ kind: 'list' });

  useEffect(() => {
    fetchCharacters()
      .then(setCharacters)
      .catch(() => setError('Не удалось загрузить персонажей.'));
  }, []);

  function upsertCharacter(updated: Character) {
    setCharacters((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
  }

  async function handleCreate(name: string) {
    const created = await createCharacter(name);
    setCharacters((prev) => (prev ? [...prev, created] : [created]));
    setView({ kind: 'detail', characterId: created.id });
  }

  async function handleDelete(character: Character) {
    if (!window.confirm(`Удалить персонажа «${character.name}»?`)) return;
    await deleteCharacter(character.id);
    setCharacters((prev) => prev?.filter((c) => c.id !== character.id) ?? prev);
    setView({ kind: 'list' });
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NavigationBar title="Персонажи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
        <div className="px-5 py-4 text-negative">{error}</div>
      </div>
    );
  }

  if (view.kind === 'create') {
    return <CharacterCreateView onCancel={() => setView({ kind: 'list' })} onSubmit={handleCreate} />;
  }

  if (view.kind === 'detail') {
    const character = characters?.find((c) => c.id === view.characterId) ?? null;
    if (!character) {
      return (
        <div className="flex-1 min-h-0 flex flex-col">
          <NavigationBar title="Персонажи" onBack={() => setView({ kind: 'list' })} />
          <div className="px-5 py-4 text-body-secondary">Загрузка…</div>
        </div>
      );
    }
    return (
      <CharacterDetailView
        character={character}
        onBack={() => setView({ kind: 'list' })}
        onUpdate={upsertCharacter}
        onDelete={() => handleDelete(character)}
        onOpenDialogue={(usage) =>
          setView({ kind: 'dialogue', characterId: character.id, chunkId: usage.chunkId, chunkText: usage.chunkText, chunkTranslation: usage.chunkTranslation })
        }
      />
    );
  }

  if (view.kind === 'dialogue') {
    const { characterId, chunkId, chunkText, chunkTranslation } = view;
    return (
      <DialogueBuilderView chunk={{ id: chunkId, text: chunkText, translation: chunkTranslation }} onBack={() => setView({ kind: 'detail', characterId })} />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Персонажи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[14.5px] font-medium">Персонажи</div>
            <Button size="sm" variant="secondary" onClick={() => setView({ kind: 'create' })}>
              + Персонаж
            </Button>
          </div>
          {characters === null && <div className="text-body-secondary py-2">Загрузка…</div>}
          {characters?.length === 0 && <div className="text-body-secondary py-2">Персонажей пока нет.</div>}
          {characters && characters.length > 0 && (
            <div className="grid grid-cols-2 min-[768px]:grid-cols-3 gap-3">
              {characters.map((character) => (
                <CharacterListCard key={character.id} character={character} onClick={() => setView({ kind: 'detail', characterId: character.id })} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
