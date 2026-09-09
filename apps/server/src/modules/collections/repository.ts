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
