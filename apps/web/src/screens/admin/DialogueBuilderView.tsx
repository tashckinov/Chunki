import { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiUrl } from '../../lib/collections';
import { highlightTarget } from '../../lib/textHighlight';
import { emotionLabel, groupImagesByEmotion } from '../../lib/characterEmotions';
import { fetchCharacters, type Character } from '../../lib/characters';
import { fetchAdminDialogue, saveAdminDialogue, deleteAdminDialogue, type AdminDialogueParticipant } from '../../lib/dialogues';
import type { AdminChunk } from '../../lib/admin';
import { buildDialogueAiPrompt } from '../../lib/dialogueAiPrompt';
import { parseDialogueImport } from '../../lib/dialogueImport';

/** The builder only ever reads id/text/translation — any caller with just these three can open it (e.g. a chunk reached via a character's usage list, which doesn't carry the rest of AdminChunk's fields). */
export type DialogueBuilderChunk = Pick<AdminChunk, 'id' | 'text' | 'translation'>;
import { NavigationBar } from '../../components/ui/NavigationBar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { IconButton } from '../../components/ui/IconButton';
import { Icon } from '../../components/ui/Icon';
import { Sheet } from '../../components/ui/Sheet';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { DialoguePlayback, type PlaybackMessage } from '../../components/dialogue/DialoguePlayback';

interface BuilderMessage {
  id: string; // client-local, for React keys / drag-reorder / edit lookup — stripped before saving
  characterId: string;
  characterImageId: string;
  text: string;
}

type WizardState =
  | { step: 'character'; editingMessageId?: string }
  | { step: 'side'; characterId: string; editingMessageId?: string }
  | { step: 'emotion'; characterId: string; side: 'left' | 'right'; editingMessageId?: string }
  | { step: 'text'; characterId: string; side: 'left' | 'right'; characterImageId: string; editingMessageId?: string };

function resolveSide(participants: AdminDialogueParticipant[], characterId: string): 'left' | 'right' | undefined {
  return participants.find((p) => p.characterId === characterId)?.side;
}

function SaveButton({ onClick, disabled, saving, justSaved }: { onClick: () => void; disabled: boolean; saving: boolean; justSaved: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pressable flex-none text-[14.5px] font-semibold text-accent disabled:opacity-50 px-2">
      {saving ? 'Сохраняем…' : justSaved ? 'Сохранено' : 'Сохранить'}
    </button>
  );
}

/** Copies an AI instruction (chunk + full character/emotion/image library) to the clipboard, for composing a dialogue in an external AI chat. */
function CopyPromptButton({ chunk, characters }: { chunk: DialogueBuilderChunk; characters: Character[] | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!characters) return;
    await navigator.clipboard.writeText(buildDialogueAiPrompt(chunk, characters));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return <IconButton icon={copied ? 'Check' : 'Copy'} label="Скопировать инструкцию для ИИ" onClick={copy} disabled={!characters} />;
}

function CharacterPickerStep({ characters, onPick }: { characters: Character[]; onPick: (characterId: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {characters.map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c.id)} className="pressable flex flex-col gap-1.5 items-center">
          <div className="aspect-[3/4] w-full rounded-[var(--radius-md)] bg-surface-subtle overflow-hidden flex items-center justify-center">
            {c.fullBodyImageUrl ? <img src={apiUrl(c.fullBodyImageUrl)} alt="" className="w-full h-full object-cover" /> : <Icon name="Characters" size={26} className="text-text-tertiary" />}
          </div>
          <div className="text-[13px] font-medium truncate w-full text-center">{c.name}</div>
        </button>
      ))}
      {characters.length === 0 && <div className="col-span-3 text-body-secondary text-[13.5px]">В библиотеке пока нет персонажей — добавьте их в разделе «Персонажи».</div>}
    </div>
  );
}

function SidePickerStep({ onPick }: { onPick: (side: 'left' | 'right') => void }) {
  return (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={() => onPick('left')}>
        Слева
      </Button>
      <Button variant="secondary" className="flex-1" onClick={() => onPick('right')}>
        Справа
      </Button>
    </div>
  );
}

function EmotionPickerStep({ character, onPick }: { character: Character | undefined; onPick: (imageId: string) => void }) {
  if (!character) return null;
  const groups = groupImagesByEmotion(character.images);
  if (groups.length === 0) {
    return <div className="text-body-secondary text-[13.5px]">У {character.name} пока нет загруженных эмоций — добавьте их в разделе «Персонажи».</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([emotion, images]) => (
        <div key={emotion} className="flex flex-col gap-1.5">
          <div className="text-[13px] font-medium text-text-secondary">{emotionLabel(emotion)}</div>
          <div className="flex gap-2 flex-wrap">
            {images.map((img) => (
              <button key={img.id} type="button" onClick={() => onPick(img.id)} className="pressable w-16 h-16 rounded-[var(--radius-md)] overflow-hidden bg-surface-subtle">
                <img src={apiUrl(img.imageUrl)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TextStep({ characterName, initialText, onCommit, onChangeCharacter }: { characterName: string; initialText: string; onCommit: (text: string) => void; onChangeCharacter: () => void }) {
  const [text, setText] = useState(initialText);
  return (
    <div className="flex flex-col gap-3">
      <Input value={text} onChange={setText} placeholder={`Что скажет ${characterName}?`} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={onChangeCharacter} className="text-[13px] text-text-secondary underline">
          Сменить персонажа
        </button>
        <Button size="sm" disabled={!text.trim()} onClick={() => onCommit(text)}>
          Готово
        </Button>
      </div>
    </div>
  );
}

function EditableMessageRow({
  message,
  characterName,
  imageUrl,
  side,
  targetText,
  onEditPortrait,
  onEditText,
  onDelete,
}: {
  message: BuilderMessage;
  characterName: string;
  imageUrl: string | undefined;
  side: 'left' | 'right';
  targetText: string;
  onEditPortrait: () => void;
  onEditText: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: message.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border p-2">
      <button type="button" {...attributes} {...listeners} className="flex-none w-6 h-6 flex items-center justify-center text-text-tertiary touch-none cursor-grab" aria-label="Перетащить">
        <Icon name="Grip" size={14} />
      </button>
      <button type="button" onClick={onEditPortrait} className="flex-none" aria-label="Изменить эмоцию/персонажа">
        {imageUrl ? <img src={apiUrl(imageUrl)} alt="" className="w-9 h-9 rounded-full object-cover bg-surface-subtle" /> : <div className="w-9 h-9 rounded-full bg-surface-subtle" />}
      </button>
      <button type="button" onClick={onEditText} className="flex-1 min-w-0 text-left">
        <div className="text-meta">
          {characterName} · {side === 'left' ? 'слева' : 'справа'}
        </div>
        <div className="text-[14.5px] truncate">{highlightTarget(message.text, targetText)}</div>
      </button>
      <IconButton icon="Delete" label="Удалить сообщение" size="sm" tone="muted" onClick={onDelete} />
    </div>
  );
}

export function DialogueBuilderView({ chunk, onBack }: { chunk: DialogueBuilderChunk; onBack: () => void }) {
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [participants, setParticipants] = useState<AdminDialogueParticipant[]>([]);
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [mode, setMode] = useState<'editor' | 'preview'>('editor');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    Promise.all([fetchCharacters(), fetchAdminDialogue(chunk.id)])
      .then(([chars, dialogue]) => {
        setCharacters(chars);
        if (dialogue) {
          setParticipants(dialogue.participants);
          setMessages(dialogue.messages.map((m, i) => ({ id: `m-${i}`, ...m })));
        } else {
          setParticipants([]);
          setMessages([]);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoadError('Не удалось загрузить данные для редактора диалога.');
        setLoaded(true);
      });
  }, [chunk.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = messages.findIndex((m) => m.id === active.id);
    const newIndex = messages.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setMessages((msgs) => arrayMove(msgs, oldIndex, newIndex));
  }

  function pickCharacter(characterId: string, editingMessageId?: string) {
    const existingSide = resolveSide(participants, characterId);
    if (existingSide) {
      setWizard({ step: 'emotion', characterId, side: existingSide, editingMessageId });
      return;
    }
    const side: 'left' | 'right' | null = participants.length === 0 ? 'left' : participants.length === 1 ? 'right' : null;
    if (side) {
      setParticipants((p) => [...p, { characterId, side }]);
      setWizard({ step: 'emotion', characterId, side, editingMessageId });
    } else {
      setWizard({ step: 'side', characterId, editingMessageId });
    }
  }

  function pickSide(side: 'left' | 'right') {
    if (wizard?.step !== 'side') return;
    const { characterId, editingMessageId } = wizard;
    setParticipants((p) => [...p, { characterId, side }]);
    setWizard({ step: 'emotion', characterId, side, editingMessageId });
  }

  function pickImage(characterImageId: string) {
    if (wizard?.step !== 'emotion') return;
    const { characterId, side, editingMessageId } = wizard;
    setWizard({ step: 'text', characterId, side, characterImageId, editingMessageId });
  }

  function commitMessage(text: string) {
    if (wizard?.step !== 'text' || !text.trim()) return;
    const { characterId, characterImageId, editingMessageId } = wizard;
    if (editingMessageId) {
      setMessages((msgs) => msgs.map((m) => (m.id === editingMessageId ? { ...m, characterId, characterImageId, text: text.trim() } : m)));
    } else {
      setMessages((msgs) => [...msgs, { id: crypto.randomUUID(), characterId, characterImageId, text: text.trim() }]);
    }
    setWizard(null);
  }

  function deleteMessage(id: string) {
    setMessages((msgs) => msgs.filter((m) => m.id !== id));
  }

  function setParticipantSide(characterId: string, side: 'left' | 'right') {
    setParticipants((p) => p.map((x) => (x.characterId === characterId ? { ...x, side } : x)));
  }

  /** Loads a pasted AI reply into the same local state the manual wizard populates, then flips to Предпросмотр — "Сохранить" (below) is the existing, already-validated approval step. */
  function applyImport() {
    const result = parseDialogueImport(importText, characters ?? []);
    if (result.kind === 'error') {
      setImportError(result.message);
      return;
    }
    if (messages.length > 0 && !window.confirm('Заменить текущий диалог вставленным?')) return;
    setParticipants(result.dialogue.participants);
    setMessages(result.dialogue.messages.map((m) => ({ id: crypto.randomUUID(), ...m })));
    setMode('preview');
    setImportOpen(false);
    setImportText('');
    setImportError(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveAdminDialogue(chunk.id, { participants, messages: messages.map(({ characterId, characterImageId, text }) => ({ characterId, characterImageId, text })) });
      setParticipants(saved.participants);
      setMessages(saved.messages.map((m, i) => ({ id: `m-${i}`, ...m })));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDialogue() {
    if (!window.confirm('Удалить диалог для этого чанка?')) return;
    await deleteAdminDialogue(chunk.id);
    onBack();
  }

  if (!loaded) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NavigationBar title={chunk.text} onBack={onBack} />
        <div className="px-5 py-4 text-body-secondary">Загрузка…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NavigationBar title={chunk.text} onBack={onBack} />
        <div className="px-5 py-4 text-negative">{loadError}</div>
      </div>
    );
  }

  const usesTarget = messages.some((m) => m.text.toLowerCase().includes(chunk.text.toLowerCase()));

  const playbackMessages: PlaybackMessage[] = messages.map((m) => {
    const character = characters?.find((c) => c.id === m.characterId);
    const image = character?.images.find((i) => i.id === m.characterImageId);
    return {
      characterName: character?.name ?? '?',
      imageUrl: image?.imageUrl ?? '',
      side: resolveSide(participants, m.characterId) ?? 'left',
      text: m.text,
    };
  });

  const wizardCharacter = wizard && wizard.step !== 'character' ? characters?.find((c) => c.id === wizard.characterId) : undefined;
  const wizardTitle =
    wizard?.step === 'character' ? 'Кто говорит?' : wizard?.step === 'side' ? 'С какой стороны?' : wizard?.step === 'emotion' ? 'Какая эмоция?' : wizard?.step === 'text' ? 'Текст сообщения' : undefined;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar
        title={chunk.text}
        onBack={onBack}
        trailing={
          <div className="flex items-center gap-1">
            <CopyPromptButton chunk={chunk} characters={characters} />
            <IconButton icon="Paste" label="Вставить диалог от ИИ" onClick={() => setImportOpen(true)} />
            <SaveButton onClick={save} saving={saving} justSaved={justSaved} disabled={saving || messages.length === 0} />
          </div>
        }
      />
      <div className="px-5 pt-1 pb-2 text-meta">
        Диалог для «{chunk.text}» / {chunk.translation}
      </div>
      <div className="px-5 pb-3">
        <SegmentedControl
          options={[
            { value: 'editor' as const, label: 'Редактор' },
            { value: 'preview' as const, label: 'Предпросмотр' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <div className="scroll-clean flex-1 min-h-0 px-5 pb-6">
        {mode === 'preview' ? (
          messages.length === 0 ? (
            <div className="text-body-secondary text-[13.5px]">Добавьте сообщения в редакторе, чтобы увидеть предпросмотр.</div>
          ) : (
            <DialoguePlayback messages={playbackMessages} targetText={chunk.text} autoPlay={false} />
          )
        ) : (
          <div className="flex flex-col gap-5">
            {saveError && <div className="text-negative text-[13px]">Не удалось сохранить: {saveError}</div>}

            {participants.length > 0 && (
              <button type="button" onClick={() => setSceneSettingsOpen(true)} className="self-start text-[13px] text-text-secondary underline">
                Персонажи и стороны
              </button>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={messages.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {messages.map((m) => {
                    const character = characters?.find((c) => c.id === m.characterId);
                    const image = character?.images.find((i) => i.id === m.characterImageId);
                    return (
                      <EditableMessageRow
                        key={m.id}
                        message={m}
                        characterName={character?.name ?? '?'}
                        imageUrl={image?.imageUrl}
                        side={resolveSide(participants, m.characterId) ?? 'left'}
                        targetText={chunk.text}
                        onEditPortrait={() => setWizard({ step: 'emotion', characterId: m.characterId, side: resolveSide(participants, m.characterId) ?? 'left', editingMessageId: m.id })}
                        onEditText={() => setWizard({ step: 'text', characterId: m.characterId, side: resolveSide(participants, m.characterId) ?? 'left', characterImageId: m.characterImageId, editingMessageId: m.id })}
                        onDelete={() => deleteMessage(m.id)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {participants.length === 0 ? (
              <Button onClick={() => setWizard({ step: 'character' })} className="self-start">
                + Добавить сообщение
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="text-meta">Кто говорит дальше?</div>
                <div className="flex gap-2 flex-wrap items-center">
                  {participants.map((p) => {
                    const character = characters?.find((c) => c.id === p.characterId);
                    if (!character) return null;
                    return (
                      <button
                        key={p.characterId}
                        type="button"
                        onClick={() => setWizard({ step: 'emotion', characterId: p.characterId, side: p.side })}
                        className="pressable flex items-center gap-2 rounded-full bg-surface-subtle pl-1.5 pr-3 py-1.5"
                      >
                        {character.fullBodyImageUrl ? (
                          <img src={apiUrl(character.fullBodyImageUrl)} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-border" />
                        )}
                        <span className="text-[13.5px] font-medium">
                          {character.name} — {p.side === 'left' ? 'слева' : 'справа'}
                        </span>
                      </button>
                    );
                  })}
                  <Button variant="secondary" size="sm" onClick={() => setWizard({ step: 'character' })}>
                    Другой персонаж
                  </Button>
                </div>
              </div>
            )}

            {!usesTarget && messages.length > 0 && (
              <div className="text-[13px] text-accent bg-accent-subtle rounded-[var(--radius-md)] px-3 py-2">Диалог пока не использует фразу «{chunk.text}».</div>
            )}

            <Button variant="ghost" size="sm" onClick={handleDeleteDialogue} className="self-start text-negative">
              Удалить диалог
            </Button>
          </div>
        )}
      </div>

      <Sheet open={!!wizard} onOpenChange={(open) => !open && setWizard(null)} title={wizardTitle}>
        {wizard?.step === 'character' && <CharacterPickerStep characters={characters ?? []} onPick={(id) => pickCharacter(id, wizard.editingMessageId)} />}
        {wizard?.step === 'side' && <SidePickerStep onPick={pickSide} />}
        {wizard?.step === 'emotion' && <EmotionPickerStep character={wizardCharacter} onPick={pickImage} />}
        {wizard?.step === 'text' && (
          <TextStep
            characterName={wizardCharacter?.name ?? ''}
            initialText={wizard.editingMessageId ? messages.find((m) => m.id === wizard.editingMessageId)?.text ?? '' : ''}
            onCommit={commitMessage}
            onChangeCharacter={() => setWizard({ step: 'character', editingMessageId: wizard.editingMessageId })}
          />
        )}
      </Sheet>

      <Sheet open={sceneSettingsOpen} onOpenChange={setSceneSettingsOpen} title="Персонажи и стороны">
        <div className="flex flex-col gap-3">
          {participants.map((p) => {
            const character = characters?.find((c) => c.id === p.characterId);
            return (
              <div key={p.characterId} className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium">{character?.name ?? '?'}</span>
                <SegmentedControl
                  options={[
                    { value: 'left' as const, label: 'Слева' },
                    { value: 'right' as const, label: 'Справа' },
                  ]}
                  value={p.side}
                  onChange={(v) => setParticipantSide(p.characterId, v)}
                />
              </div>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={importOpen} onOpenChange={(open) => !open && setImportOpen(false)} title="Вставить диалог от ИИ">
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] text-body-secondary">Вставьте JSON-ответ ИИ (полученный по скопированной инструкции). После вставки диалог откроется в предпросмотре — сохраните его, если всё устраивает.</div>
          <Textarea value={importText} onChange={(v) => { setImportText(v); setImportError(null); }} placeholder='{"participants": [...], "messages": [...]}' rows={10} />
          {importError && <div className="text-negative text-[13px]">{importError}</div>}
          <Button size="sm" onClick={applyImport} disabled={!importText.trim()}>
            Вставить и посмотреть
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
