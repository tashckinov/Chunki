import type { Character } from './characters';
import type { AdminDialogueParticipant, AdminDialogueMessage } from './dialogues';

export interface ParsedDialogue {
  participants: AdminDialogueParticipant[];
  messages: AdminDialogueMessage[];
}

export type ParseDialogueImportResult = { kind: 'ok'; dialogue: ParsedDialogue } | { kind: 'error'; message: string };

/**
 * Validates a pasted AI reply against the same rules the server enforces on
 * save (dialogues/repository.ts's referencesAreValid) — catches a bad
 * character/image id immediately instead of only failing at Save time.
 */
export function parseDialogueImport(text: string, characters: Character[]): ParseDialogueImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }

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
