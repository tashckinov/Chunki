import { HAS_BROWSE_DIALOGUE } from '../chunks/repository.js';
import { pool } from '../../db/pool.js';

export interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  banner_url: string | null;
}

export async function listPublishedCollections(): Promise<CollectionRow[]> {
  const { rows } = await pool.query<CollectionRow>(
    `SELECT id, slug, title, description, level, position, banner_url
     FROM collections
     WHERE is_published = true
     ORDER BY position, title`,
  );
  return rows;
}

export async function findPublishedCollectionBySlug(slug: string): Promise<CollectionRow | null> {
  const { rows } = await pool.query<CollectionRow>(
    `SELECT id, slug, title, description, level, position, banner_url
     FROM collections
     WHERE slug = $1 AND is_published = true`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function listComicCollections() {
  const { rows } = await pool.query<{ slug: string; title: string; level: string; count: number }>(
    `SELECT col.slug, col.title, col.level, count(*)::int AS count
     FROM collections col JOIN collection_chunks cc ON cc.collection_id = col.id
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE col.is_published AND ${HAS_BROWSE_DIALOGUE}
     GROUP BY col.id ORDER BY col.position, col.title, col.id`,
  );
  return rows;
}

export async function listCollectionComics(slug: string, offset: number) {
  const size = 12;
  const { rows } = await pool.query<{ id: string; text: string; translation: string }>(
    `SELECT c.id, c.text, c.translation
     FROM collections col JOIN collection_chunks cc ON cc.collection_id = col.id
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE col.slug = $1 AND col.is_published AND ${HAS_BROWSE_DIALOGUE}
     ORDER BY cc.position, c.id LIMIT $2 OFFSET $3`,
    [slug, size + 1, offset],
  );
  return { comics: rows.slice(0, size), nextOffset: rows.length > size ? offset + size : null };
}
