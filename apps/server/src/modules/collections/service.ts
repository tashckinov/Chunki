import { findPublishedCollectionBySlug, listPublishedCollections, type CollectionRow } from './repository.js';
import { listChunksForCollection } from '../chunks/repository.js';
import { toChunkSummary, type ChunkSummary } from '../chunks/service.js';

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

function toSummary(row: CollectionRow): CollectionSummary {
  return { id: row.id, slug: row.slug, title: row.title, description: row.description, level: row.level };
}

export async function getPublishedCollections(): Promise<CollectionSummary[]> {
  const rows = await listPublishedCollections();
  return rows.map(toSummary);
}

export async function getPublishedCollectionBySlug(slug: string): Promise<CollectionDetail | null> {
  const collection = await findPublishedCollectionBySlug(slug);
  if (!collection) return null;
  const chunkRows = await listChunksForCollection(collection.id);
  return { ...toSummary(collection), chunks: chunkRows.map(toChunkSummary) };
}
