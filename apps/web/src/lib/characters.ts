import { getJson, postJson, patchJson, deleteJson, postFormData } from './collections';

export interface CharacterImage {
  id: string;
  emotion: string;
  imageUrl: string;
  position: number;
}

export interface Character {
  id: string;
  name: string;
  fullBodyImageUrl: string | null;
  position: number;
  images: CharacterImage[];
}

export async function fetchCharacters(): Promise<Character[]> {
  const data = await getJson<{ characters: Character[] }>('/api/admin/characters');
  return data.characters;
}

export async function createCharacter(name: string): Promise<Character> {
  const data = await postJson<{ character: Character }>('/api/admin/characters', { name });
  return data.character;
}

export async function updateCharacter(id: string, patch: { name?: string }): Promise<Character> {
  const data = await patchJson<{ character: Character }>(`/api/admin/characters/${id}`, patch);
  return data.character;
}

export async function deleteCharacter(id: string): Promise<void> {
  await deleteJson(`/api/admin/characters/${id}`);
}

export async function uploadFullBodyImage(characterId: string, file: File): Promise<Character> {
  const form = new FormData();
  form.set('file', file);
  const data = await postFormData<{ character: Character }>(`/api/admin/characters/${characterId}/full-body-image`, form);
  return data.character;
}

/** One shared emotion label applies to every file in the batch. */
export async function uploadCharacterImages(characterId: string, emotion: string, files: File[]): Promise<CharacterImage[]> {
  const form = new FormData();
  form.set('emotion', emotion);
  for (const file of files) form.append('file', file);
  const data = await postFormData<{ images: CharacterImage[] }>(`/api/admin/characters/${characterId}/images`, form);
  return data.images;
}

/** Relabels an image to a different emotion — how "drag into a different emotion group" persists. */
export async function moveCharacterImageToEmotion(characterId: string, imageId: string, emotion: string): Promise<CharacterImage> {
  const data = await patchJson<{ image: CharacterImage }>(`/api/admin/characters/${characterId}/images/${imageId}`, { emotion });
  return data.image;
}

export async function reorderCharacterImages(characterId: string, emotion: string, imageIds: string[]): Promise<void> {
  await postJson(`/api/admin/characters/${characterId}/images/reorder`, { emotion, imageIds });
}

export async function deleteCharacterImage(characterId: string, imageId: string): Promise<void> {
  await deleteJson(`/api/admin/characters/${characterId}/images/${imageId}`);
}

export interface CharacterChunkUsage {
  chunkId: string;
  chunkText: string;
  collectionTitles: string[];
}

/** Every chunk whose dialogue actually uses this character — lets the admin see the impact before deleting one. */
export async function fetchCharacterUsage(characterId: string): Promise<CharacterChunkUsage[]> {
  const data = await getJson<{ chunks: CharacterChunkUsage[] }>(`/api/admin/characters/${characterId}/chunks`);
  return data.chunks;
}
