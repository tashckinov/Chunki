import {
  findDialogueByChunkId,
  saveDialogue as repoSaveDialogue,
  deleteDialogueForChunk as repoDeleteDialogueForChunk,
  findLearnerDialogueRows,
  type DialogueInput,
  type DialogueWithContent,
} from './repository.js';

export interface DialogueParticipantSummary {
  characterId: string;
  side: 'left' | 'right';
}

export interface DialogueMessageSummary {
  characterId: string;
  characterImageId: string;
  text: string;
}

export interface DialogueSummary {
  participants: DialogueParticipantSummary[];
  messages: DialogueMessageSummary[];
}

function toDialogueSummary(content: DialogueWithContent): DialogueSummary {
  return {
    participants: content.participants.map((p) => ({ characterId: p.character_id, side: p.side })),
    messages: content.messages.map((m) => ({ characterId: m.character_id, characterImageId: m.character_image_id, text: m.text })),
  };
}

export async function getDialogueForChunk(chunkId: string): Promise<DialogueSummary | null> {
  const content = await findDialogueByChunkId(chunkId);
  return content ? toDialogueSummary(content) : null;
}

export type SaveDialogueResult = { kind: 'ok'; dialogue: DialogueSummary } | { kind: 'invalid_reference' };

/** Save/upsert — a chunk has at most one dialogue; a repeat call replaces it, never creates a second one. */
export async function saveDialogue(chunkId: string, input: DialogueInput): Promise<SaveDialogueResult> {
  const result = await repoSaveDialogue(chunkId, input);
  return result.kind === 'ok' ? { kind: 'ok', dialogue: toDialogueSummary(result.content) } : { kind: 'invalid_reference' };
}

export async function deleteDialogueForChunk(chunkId: string): Promise<boolean> {
  return repoDeleteDialogueForChunk(chunkId);
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
  const rows = await findLearnerDialogueRows(chunkId);
  if (rows.length === 0) return null;
  return {
    chunkId,
    messages: rows.map((r) => ({ characterName: r.character_name, imageUrl: r.image_url, side: r.side, text: r.text })),
  };
}
