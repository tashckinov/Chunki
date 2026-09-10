import {
  listCharacters as repoListCharacters,
  findCharacterById as repoFindCharacterById,
  createCharacter as repoCreateCharacter,
  updateCharacter as repoUpdateCharacter,
  deleteCharacter as repoDeleteCharacter,
  addCharacterImage as repoAddCharacterImage,
  updateCharacterImage as repoUpdateCharacterImage,
  reorderCharacterImages as repoReorderCharacterImages,
  deleteCharacterImage as repoDeleteCharacterImage,
  type CharacterRow,
  type CharacterImageRow,
  type CharacterWithImages,
  type CharacterPatch,
  type CharacterImagePatch,
} from './repository.js';
import { findChunksUsingCharacter as findChunksUsingCharacterDialogues, type ChunkUsingCharacter } from '../dialogues/service.js';

export interface CharacterImageSummary {
  id: string;
  emotion: string;
  imageUrl: string;
  description: string | null;
  position: number;
}

export interface CharacterSummary {
  id: string;
  name: string;
  fullBodyImageUrl: string | null;
  position: number;
  images: CharacterImageSummary[];
}

function toImageSummary(row: CharacterImageRow): CharacterImageSummary {
  return { id: row.id, emotion: row.emotion, imageUrl: row.image_url, description: row.description, position: row.position };
}

function toCharacterSummary({ character, images }: CharacterWithImages): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    fullBodyImageUrl: character.full_body_image_url,
    position: character.position,
    images: images.map(toImageSummary),
  };
}

export async function listCharacters(): Promise<CharacterSummary[]> {
  return (await repoListCharacters()).map(toCharacterSummary);
}

export type CharacterResult = { kind: 'ok'; character: CharacterSummary } | { kind: 'not_found' };

export async function findCharacter(id: string): Promise<CharacterResult> {
  const found = await repoFindCharacterById(id);
  return found ? { kind: 'ok', character: toCharacterSummary(found) } : { kind: 'not_found' };
}

function toCharacterSummaryFromRow(row: CharacterRow): CharacterSummary {
  return { id: row.id, name: row.name, fullBodyImageUrl: row.full_body_image_url, position: row.position, images: [] };
}

export async function createCharacter(name: string): Promise<CharacterSummary> {
  return toCharacterSummaryFromRow(await repoCreateCharacter(name));
}

export async function updateCharacter(id: string, patch: CharacterPatch): Promise<CharacterResult> {
  const row = await repoUpdateCharacter(id, patch);
  if (!row) return { kind: 'not_found' };
  return findCharacter(id);
}

export async function deleteCharacter(id: string): Promise<boolean> {
  return repoDeleteCharacter(id);
}

export async function addCharacterImage(characterId: string, input: { emotion: string; imageUrl: string; description?: string | null }): Promise<CharacterImageSummary> {
  return toImageSummary(await repoAddCharacterImage(characterId, input));
}

export async function updateCharacterImage(id: string, patch: CharacterImagePatch): Promise<CharacterImageSummary | null> {
  const row = await repoUpdateCharacterImage(id, patch);
  return row ? toImageSummary(row) : null;
}

export async function reorderCharacterImages(characterId: string, emotion: string, imageIds: string[]): Promise<void> {
  return repoReorderCharacterImages(characterId, emotion, imageIds);
}

export type DeleteImageResult = 'ok' | 'not_found' | 'in_use';

export async function deleteCharacterImage(id: string): Promise<DeleteImageResult> {
  return repoDeleteCharacterImage(id);
}

export async function findChunksUsingCharacter(characterId: string): Promise<ChunkUsingCharacter[]> {
  return findChunksUsingCharacterDialogues(characterId);
}
