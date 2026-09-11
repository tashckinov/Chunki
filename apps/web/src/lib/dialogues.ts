import { getJson, postJson, deleteJson } from './collections';

/**
 * 'browse' is the passive comic shown on "Не знаю"; 'situation' is the
 * comic shown in "Ситуация" whose last message the learner fills in
 * themselves (see AdminDialogueMessage.isBlank).
 */
export type DialogueKind = 'browse' | 'situation';

export interface AdminDialogueParticipant {
  characterId: string;
  side: 'left' | 'right';
}

export interface AdminDialogueMessage {
  characterId: string;
  characterImageId: string;
  text: string;
  /** 'situation'-kind dialogues only: marks this as the line the learner writes themselves — must be the last message. */
  isBlank?: boolean;
}

export interface AdminDialogue {
  participants: AdminDialogueParticipant[];
  messages: AdminDialogueMessage[];
}

export async function fetchAdminDialogue(chunkId: string, kind: DialogueKind): Promise<AdminDialogue | null> {
  const data = await getJson<{ dialogue: AdminDialogue | null }>(`/api/admin/chunks/${chunkId}/dialogue/${kind}`);
  return data.dialogue;
}

/** Save/upsert — a chunk has at most one dialogue per kind; calling this again for the same kind replaces it, it never creates a second one. */
export async function saveAdminDialogue(chunkId: string, kind: DialogueKind, dialogue: AdminDialogue): Promise<AdminDialogue> {
  const data = await postJson<{ dialogue: AdminDialogue }>(`/api/admin/chunks/${chunkId}/dialogue/${kind}`, dialogue);
  return data.dialogue;
}

export async function deleteAdminDialogue(chunkId: string, kind: DialogueKind): Promise<void> {
  await deleteJson(`/api/admin/chunks/${chunkId}/dialogue/${kind}`);
}
