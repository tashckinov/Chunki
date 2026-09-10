import { getJson, postJson, deleteJson } from './collections';

export interface AdminDialogueParticipant {
  characterId: string;
  side: 'left' | 'right';
}

export interface AdminDialogueMessage {
  characterId: string;
  characterImageId: string;
  text: string;
}

export interface AdminDialogue {
  participants: AdminDialogueParticipant[];
  messages: AdminDialogueMessage[];
}

export async function fetchAdminDialogue(chunkId: string): Promise<AdminDialogue | null> {
  const data = await getJson<{ dialogue: AdminDialogue | null }>(`/api/admin/chunks/${chunkId}/dialogue`);
  return data.dialogue;
}

/** Save/upsert — a chunk has at most one dialogue; calling this again replaces it, it never creates a second one. */
export async function saveAdminDialogue(chunkId: string, dialogue: AdminDialogue): Promise<AdminDialogue> {
  const data = await postJson<{ dialogue: AdminDialogue }>(`/api/admin/chunks/${chunkId}/dialogue`, dialogue);
  return data.dialogue;
}

export async function deleteAdminDialogue(chunkId: string): Promise<void> {
  await deleteJson(`/api/admin/chunks/${chunkId}/dialogue`);
}
