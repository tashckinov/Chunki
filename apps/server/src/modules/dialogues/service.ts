import {
  findDialogueByChunkId,
  saveDialogue as repoSaveDialogue,
  deleteDialogueForChunk as repoDeleteDialogueForChunk,
  findLearnerDialogueRows,
  findChunksUsingCharacter as repoFindChunksUsingCharacter,
  type DialogueInput,
  type DialogueKind,
  type DialogueWithContent,
} from './repository.js';

export type { DialogueKind } from './repository.js';

export interface DialogueParticipantSummary {
  characterId: string;
  side: 'left' | 'right';
}

export interface DialogueMessageSummary {
  characterId: string;
  characterImageId: string;
  text: string;
  isBlank: boolean;
}

export interface DialogueSummary {
  participants: DialogueParticipantSummary[];
  messages: DialogueMessageSummary[];
}

function toDialogueSummary(content: DialogueWithContent): DialogueSummary {
  return {
    participants: content.participants.map((p) => ({ characterId: p.character_id, side: p.side })),
    messages: content.messages.map((m) => ({ characterId: m.character_id, characterImageId: m.character_image_id, text: m.text, isBlank: m.is_blank })),
  };
}

export async function getDialogueForChunk(chunkId: string, kind: DialogueKind): Promise<DialogueSummary | null> {
  const content = await findDialogueByChunkId(chunkId, kind);
  return content ? toDialogueSummary(content) : null;
}

export type SaveDialogueResult = { kind: 'ok'; dialogue: DialogueSummary } | { kind: 'invalid_reference' };

/** Save/upsert — a chunk has at most one dialogue per kind; a repeat call for the same kind replaces it, never creates a second one. */
export async function saveDialogue(chunkId: string, kind: DialogueKind, input: DialogueInput): Promise<SaveDialogueResult> {
  const result = await repoSaveDialogue(chunkId, kind, input);
  return result.kind === 'ok' ? { kind: 'ok', dialogue: toDialogueSummary(result.content) } : { kind: 'invalid_reference' };
}

export async function deleteDialogueForChunk(chunkId: string, kind: DialogueKind): Promise<boolean> {
  return repoDeleteDialogueForChunk(chunkId, kind);
}

export interface LearnerDialogueMessage {
  characterName: string;
  imageUrl: string;
  side: 'left' | 'right';
  text: string;
}

export interface LearnerDialogue {
  chunkId: string;
  messages: LearnerDialogueMessage[];
}

export async function findLearnerDialogue(chunkId: string): Promise<LearnerDialogue | null> {
  const rows = await findLearnerDialogueRows(chunkId, 'browse');
  if (rows.length === 0) return null;
  return {
    chunkId,
    messages: rows.map((r) => ({ characterName: r.character_name, imageUrl: r.image_url, side: r.side, text: r.text })),
  };
}

export interface SituationDialogueForLearner {
  /** Every message except the blank one — shown to the learner as read-only context. */
  precedingMessages: LearnerDialogueMessage[];
  /** Who the learner is answering as — the blank message's speaker, not its (hidden) text. */
  blank: { characterName: string; imageUrl: string; side: 'left' | 'right' };
  /** The blank message's authored text — used to build the judge's context and shown back to the learner afterward, never sent ahead of an answer. */
  modelAnswer: string;
}

/**
 * A "Ситуация" comic is only usable in production-check once it actually has
 * its last message marked as the blank (referencesAreValid guarantees a
 * blank, if any, is last) — a comic authored but not yet finished this way
 * returns null, same as "no comic at all" one layer up (buildProductionCheck
 * falls back to the free-text situation prompt).
 */
export async function findSituationDialogueForLearner(chunkId: string): Promise<SituationDialogueForLearner | null> {
  const rows = await findLearnerDialogueRows(chunkId, 'situation');
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  if (!last.is_blank) return null;
  return {
    precedingMessages: rows.slice(0, -1).map((r) => ({ characterName: r.character_name, imageUrl: r.image_url, side: r.side, text: r.text })),
    blank: { characterName: last.character_name, imageUrl: last.image_url, side: last.side },
    modelAnswer: last.text,
  };
}

export interface ChunkUsingCharacter {
  chunkId: string;
  chunkText: string;
  chunkTranslation: string;
  dialogueKind: DialogueKind;
  collectionTitles: string[];
}

export async function findChunksUsingCharacter(characterId: string): Promise<ChunkUsingCharacter[]> {
  const rows = await repoFindChunksUsingCharacter(characterId);
  return rows.map((r) => ({ chunkId: r.chunk_id, chunkText: r.chunk_text, chunkTranslation: r.chunk_translation, dialogueKind: r.dialogue_kind, collectionTitles: r.collection_titles }));
}
