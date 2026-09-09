import {
  listUsers as repoListUsers,
  setUserPremiumUntil as repoSetUserPremiumUntil,
  listCollectionsAdmin as repoListCollectionsAdmin,
  createCollection as repoCreateCollection,
  updateCollection as repoUpdateCollection,
  listChunksForCollectionAdmin as repoListChunksForCollectionAdmin,
  createChunkInCollection as repoCreateChunkInCollection,
  updateChunk as repoUpdateChunk,
  deleteChunk as repoDeleteChunk,
  removeChunkFromCollection as repoRemoveChunkFromCollection,
  type AdminUserRow,
  type AdminCollectionRow,
  type AdminChunkRow,
  type NewCollectionInput,
  type CollectionPatch,
  type ChunkInput,
  type ChunkPatch,
} from './repository.js';
import { listAiCallLogs as repoListAiCallLogs, type AiCallLogRow } from '../aiLogs/repository.js';

export interface AdminUserSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
  premiumUntil: string | null;
}

function toUserSummary(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at.toISOString(),
    isAdmin: row.is_admin,
    premiumUntil: row.premium_until ? row.premium_until.toISOString() : null,
  };
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  return (await repoListUsers()).map(toUserSummary);
}

export type SetPremiumResult = { kind: 'ok'; user: AdminUserSummary } | { kind: 'not_found' };

export async function setUserPremiumUntil(userId: string, premiumUntil: Date | null): Promise<SetPremiumResult> {
  const row = await repoSetUserPremiumUntil(userId, premiumUntil);
  return row ? { kind: 'ok', user: toUserSummary(row) } : { kind: 'not_found' };
}

export interface AdminCollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  isPublished: boolean;
  chunkCount: number;
}

function toCollectionSummary(row: AdminCollectionRow): AdminCollectionSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    level: row.level,
    position: row.position,
    isPublished: row.is_published,
    chunkCount: row.chunk_count,
  };
}

export async function listCollectionsAdmin(): Promise<AdminCollectionSummary[]> {
  return (await repoListCollectionsAdmin()).map(toCollectionSummary);
}

export async function createCollection(input: NewCollectionInput): Promise<AdminCollectionSummary> {
  return toCollectionSummary(await repoCreateCollection(input));
}

export type UpdateCollectionResult = { kind: 'ok'; collection: AdminCollectionSummary } | { kind: 'not_found' };

export async function updateCollection(id: string, patch: CollectionPatch): Promise<UpdateCollectionResult> {
  const row = await repoUpdateCollection(id, patch);
  return row ? { kind: 'ok', collection: toCollectionSummary({ ...row, chunk_count: 0 }) } : { kind: 'not_found' };
}

export interface AdminChunkSummary {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  exampleTranslation: string | null;
  level: string;
  situationPrompt: string | null;
  position: number;
}

function toChunkSummary(row: AdminChunkRow): AdminChunkSummary {
  return {
    id: row.id,
    text: row.text,
    translation: row.translation,
    explanation: row.explanation,
    example: row.example,
    exampleTranslation: row.example_translation,
    level: row.level,
    situationPrompt: row.situation_prompt,
    position: row.position,
  };
}

export async function listChunksForCollectionAdmin(collectionId: string): Promise<AdminChunkSummary[]> {
  return (await repoListChunksForCollectionAdmin(collectionId)).map(toChunkSummary);
}

export async function createChunkInCollection(collectionId: string, input: ChunkInput): Promise<AdminChunkSummary> {
  return toChunkSummary(await repoCreateChunkInCollection(collectionId, input));
}

export type UpdateChunkResult = { kind: 'ok'; chunk: Omit<AdminChunkSummary, 'position'> } | { kind: 'not_found' };

export async function updateChunk(id: string, patch: ChunkPatch): Promise<UpdateChunkResult> {
  const row = await repoUpdateChunk(id, patch);
  if (!row) return { kind: 'not_found' };
  const { position: _unused, ...chunk } = toChunkSummary({ ...row, position: 0 });
  return { kind: 'ok', chunk };
}

export async function deleteChunk(id: string): Promise<boolean> {
  return repoDeleteChunk(id);
}

export async function removeChunkFromCollection(collectionId: string, chunkId: string): Promise<boolean> {
  return repoRemoveChunkFromCollection(collectionId, chunkId);
}

export interface AiCallLogSummary {
  id: string;
  createdAt: string;
  provider: string;
  model: string | null;
  userEmail: string | null;
  chunkText: string | null;
  request: unknown;
  response: unknown | null;
  error: string | null;
  durationMs: number;
}

function toAiCallLogSummary(row: AiCallLogRow): AiCallLogSummary {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    provider: row.provider,
    model: row.model,
    userEmail: row.user_email,
    chunkText: row.chunk_text,
    request: row.request,
    response: row.response,
    error: row.error,
    durationMs: row.duration_ms,
  };
}

export async function listAiCallLogsForAdmin(limit: number): Promise<AiCallLogSummary[]> {
  return (await repoListAiCallLogs(limit)).map(toAiCallLogSummary);
}
