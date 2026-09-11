import { authHeaders } from './auth';

// GitHub Pages is static — no dev-server proxy for /api/*, so production
// needs an absolute backend URL (set at build time, see lib/auth.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: 'include', headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Shared with lib/progress.ts — same auth/error conventions as getJson above. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Shared with lib/admin.ts — same conventions as postJson above. */
export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'PATCH',
    credentials: 'include',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Shared with lib/admin.ts — file uploads. No content-type header: the
 * browser sets multipart/form-data with the right boundary for a FormData body. */
export async function postFormData<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), { method: 'POST', credentials: 'include', headers: authHeaders(), body });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Shared with lib/admin.ts — same conventions as postJson above. */
export async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { method: 'DELETE', credentials: 'include', headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ChunkSentencePart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

export interface ChunkSentence {
  text: string;
  translation: string;
  parts: ChunkSentencePart[];
}

/** Same {text, parts} shape as ChunkSentence — admin-only, so not part of the public ChunkSummary below. */
export interface SituationPrompt {
  text: string;
  parts: ChunkSentencePart[];
}

export interface ChunkSummary {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  sentences: ChunkSentence[];
  hasDialogue: boolean;
}

export interface CollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  bannerUrl: string | null;
}

export interface CollectionDetail extends CollectionSummary {
  chunks: ChunkSummary[];
}

export async function fetchCollections(): Promise<CollectionSummary[]> {
  const data = await getJson<{ collections: CollectionSummary[] }>('/api/collections');
  return data.collections;
}

export async function fetchCollectionBySlug(slug: string): Promise<CollectionDetail> {
  const data = await getJson<{ collection: CollectionDetail }>(`/api/collections/${encodeURIComponent(slug)}`);
  return data.collection;
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

/** A chunk without a dialogue is the common case — `null` is a normal response, not an error. */
export async function fetchLearnerDialogue(chunkId: string): Promise<LearnerDialogue | null> {
  const data = await getJson<{ dialogue: LearnerDialogue | null }>(`/api/chunks/${chunkId}/dialogue`);
  return data.dialogue;
}

/** Every chunk across the given collections, deduped by id (a chunk can belong to more than one). */
export function flattenChunks(details: CollectionDetail[]): ChunkSummary[] {
  const seen = new Map<string, ChunkSummary>();
  for (const detail of details) {
    for (const chunk of detail.chunks) {
      if (!seen.has(chunk.id)) seen.set(chunk.id, chunk);
    }
  }
  return [...seen.values()];
}
