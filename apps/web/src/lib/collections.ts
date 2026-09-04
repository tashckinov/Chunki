import { authHeaders } from './auth';

// GitHub Pages is static — no dev-server proxy for /api/*, so production
// needs an absolute backend URL (set at build time, see lib/auth.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: 'include', headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, `${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ChunkSummary {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  exampleTranslation: string | null;
  level: string;
}

export interface CollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
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
