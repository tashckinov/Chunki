import type { Character } from './characters';
import type { AdminDialogueParticipant, AdminDialogueMessage } from './dialogues';
import type { PlaybackMessage } from '../components/dialogue/DialoguePlayback';

export interface ParsedDialogue {
  participants: AdminDialogueParticipant[];
  messages: AdminDialogueMessage[];
}

export type ParseDialogueImportResult = { kind: 'ok'; dialogue: ParsedDialogue } | { kind: 'error'; message: string };

/**
 * Validates one dialogue's shape against the same rules the server enforces
 * on save (dialogues/repository.ts's referencesAreValid) — catches a bad
 * character/image id immediately instead of only failing at Save time.
 * Shared by the single-chunk and bulk (per-chunk-collection) import paths.
 */
export function validateDialogueShape(raw: unknown, characters: Character[]): ParseDialogueImportResult {
  if (typeof raw !== 'object' || raw === null || !('participants' in raw) || !('messages' in raw)) {
    return { kind: 'error', message: 'Ожидается объект с полями participants и messages.' };
  }
  const { participants, messages } = raw as { participants: unknown; messages: unknown };
  if (!Array.isArray(participants) || !Array.isArray(messages)) {
    return { kind: 'error', message: 'participants и messages должны быть массивами.' };
  }

  for (const p of participants) {
    if (typeof p !== 'object' || p === null || typeof (p as { characterId?: unknown }).characterId !== 'string' || ((p as { side?: unknown }).side !== 'left' && (p as { side?: unknown }).side !== 'right')) {
      return { kind: 'error', message: 'У каждого участника должны быть characterId и side ("left" или "right").' };
    }
  }
  if (messages.length === 0) {
    return { kind: 'error', message: 'В messages нет ни одного сообщения.' };
  }

  const participantIds = new Set((participants as AdminDialogueParticipant[]).map((p) => p.characterId));
  const charactersById = new Map(characters.map((c) => [c.id, c]));

  for (const m of messages) {
    if (
      typeof m !== 'object' ||
      m === null ||
      typeof (m as { characterId?: unknown }).characterId !== 'string' ||
      typeof (m as { characterImageId?: unknown }).characterImageId !== 'string' ||
      typeof (m as { text?: unknown }).text !== 'string' ||
      !(m as { text: string }).text.trim()
    ) {
      return { kind: 'error', message: 'У каждого сообщения должны быть characterId, characterImageId и непустой text.' };
    }
    const message = m as AdminDialogueMessage;
    if (!participantIds.has(message.characterId)) {
      return { kind: 'error', message: `Персонаж ${message.characterId} используется в messages, но отсутствует в participants.` };
    }
    const character = charactersById.get(message.characterId);
    if (!character || !character.images.some((i) => i.id === message.characterImageId)) {
      return { kind: 'error', message: `Изображение ${message.characterImageId} не принадлежит персонажу ${message.characterId}.` };
    }
  }

  return { kind: 'ok', dialogue: { participants: participants as AdminDialogueParticipant[], messages: messages as AdminDialogueMessage[] } };
}

export function parseDialogueImport(text: string, characters: Character[]): ParseDialogueImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }
  return validateDialogueShape(raw, characters);
}

export interface BulkParsedDialogue {
  chunkId: string;
  dialogue: ParsedDialogue;
}

export type ParseBulkDialogueImportResult = { kind: 'ok'; dialogues: BulkParsedDialogue[] } | { kind: 'error'; message: string };

/** Same validation as parseDialogueImport, applied to every entry of a { dialogues: [...] } payload covering a whole collection. */
export function parseBulkDialogueImport(text: string, chunks: { id: string; text: string }[], characters: Character[]): ParseBulkDialogueImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { dialogues?: unknown }).dialogues)) {
    return { kind: 'error', message: 'Ожидается объект с полем dialogues (массив).' };
  }
  const items = (raw as { dialogues: unknown[] }).dialogues;
  if (items.length === 0) {
    return { kind: 'error', message: 'В dialogues нет ни одного диалога.' };
  }

  const chunkIds = new Set(chunks.map((c) => c.id));
  const seen = new Set<string>();
  const result: BulkParsedDialogue[] = [];
  for (const item of items) {
    const chunkId = (item as { chunkId?: unknown })?.chunkId;
    if (typeof chunkId !== 'string' || !chunkIds.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${String(chunkId)} не относится к этой коллекции.` };
    }
    if (seen.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${chunkId} встречается в dialogues дважды.` };
    }
    seen.add(chunkId);
    const validated = validateDialogueShape(item, characters);
    if (validated.kind === 'error') {
      const chunkText = chunks.find((c) => c.id === chunkId)?.text ?? chunkId;
      return { kind: 'error', message: `«${chunkText}»: ${validated.message}` };
    }
    result.push({ chunkId, dialogue: validated.dialogue });
  }
  return { kind: 'ok', dialogues: result };
}

/** Resolves a parsed dialogue's character/image ids into display-ready messages for DialoguePlayback. */
export function toPlaybackMessages(dialogue: ParsedDialogue, characters: Character[]): PlaybackMessage[] {
  return dialogue.messages.map((m) => {
    const character = characters.find((c) => c.id === m.characterId);
    const image = character?.images.find((i) => i.id === m.characterImageId);
    return {
      characterName: character?.name ?? '?',
      imageUrl: image?.imageUrl ?? '',
      side: dialogue.participants.find((p) => p.characterId === m.characterId)?.side ?? 'left',
      text: m.text,
    };
  });
}
