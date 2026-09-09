import { pool } from '../../db/pool.js';

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: Date;
  last_login_at: Date;
  is_admin: boolean;
  premium_until: Date | null;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  // No pagination yet — fine at this project's current scale; the row cap is
  // just a safety net, not a real pagination story.
  const { rows } = await pool.query<AdminUserRow>(
    `SELECT id, email, display_name, created_at, last_login_at, is_admin, premium_until
     FROM users
     ORDER BY created_at DESC
     LIMIT 200`,
  );
  return rows;
}

export async function setUserPremiumUntil(id: string, premiumUntil: Date | null): Promise<AdminUserRow | null> {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE users SET premium_until = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, email, display_name, created_at, last_login_at, is_admin, premium_until`,
    [id, premiumUntil],
  );
  return rows[0] ?? null;
}

export interface AdminCollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  is_published: boolean;
  chunk_count: number;
}

export async function listCollectionsAdmin(): Promise<AdminCollectionRow[]> {
  // Unlike the public collections module, this deliberately includes
  // unpublished collections — that's the whole point of an admin view.
  const { rows } = await pool.query<AdminCollectionRow>(
    `SELECT c.id, c.slug, c.title, c.description, c.level, c.position, c.is_published,
            COUNT(cc.chunk_id)::int AS chunk_count
     FROM collections c
     LEFT JOIN collection_chunks cc ON cc.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.position, c.title`,
  );
  return rows;
}

type CollectionRowNoCount = Omit<AdminCollectionRow, 'chunk_count'>;

async function findCollectionById(id: string): Promise<CollectionRowNoCount | null> {
  const { rows } = await pool.query<CollectionRowNoCount>(
    `SELECT id, slug, title, description, level, position, is_published FROM collections WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface NewCollectionInput {
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  isPublished: boolean;
}

export async function createCollection(input: NewCollectionInput): Promise<AdminCollectionRow> {
  const { rows } = await pool.query<CollectionRowNoCount>(
    `INSERT INTO collections (slug, title, description, level, position, is_published)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, slug, title, description, level, position, is_published`,
    [input.slug, input.title, input.description, input.level, input.position, input.isPublished],
  );
  return { ...rows[0], chunk_count: 0 };
}

export interface CollectionPatch {
  slug?: string;
  title?: string;
  description?: string | null;
  level?: string;
  position?: number;
  isPublished?: boolean;
}

export async function updateCollection(id: string, patch: CollectionPatch): Promise<CollectionRowNoCount | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.slug !== undefined) add('slug', patch.slug);
  if (patch.title !== undefined) add('title', patch.title);
  if (patch.description !== undefined) add('description', patch.description);
  if (patch.level !== undefined) add('level', patch.level);
  if (patch.position !== undefined) add('position', patch.position);
  if (patch.isPublished !== undefined) add('is_published', patch.isPublished);
  if (sets.length === 0) return findCollectionById(id);

  sets.push('updated_at = now()');
  const { rows } = await pool.query<CollectionRowNoCount>(
    `UPDATE collections SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, slug, title, description, level, position, is_published`,
    values,
  );
  return rows[0] ?? null;
}

export interface AdminChunkRow {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  example_translation: string | null;
  level: string;
  situation_prompt: string | null;
  position: number;
}

export async function listChunksForCollectionAdmin(collectionId: string): Promise<AdminChunkRow[]> {
  const { rows } = await pool.query<AdminChunkRow>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.example, c.example_translation, c.level, c.situation_prompt, cc.position
     FROM collection_chunks cc
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE cc.collection_id = $1
     ORDER BY cc.position`,
    [collectionId],
  );
  return rows;
}

type ChunkRowNoPosition = Omit<AdminChunkRow, 'position'>;

async function findChunkByIdAdmin(id: string): Promise<ChunkRowNoPosition | null> {
  const { rows } = await pool.query<ChunkRowNoPosition>(
    `SELECT id, text, translation, explanation, example, example_translation, level, situation_prompt FROM chunks WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface ChunkInput {
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  exampleTranslation: string | null;
  level: string;
  situationPrompt: string | null;
}

/** Inserts the chunk and appends it to the collection in one transaction — a chunk row without a collection_chunks membership would be orphaned and unreachable from any deck. */
export async function createChunkInCollection(collectionId: string, input: ChunkInput): Promise<AdminChunkRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: chunkRows } = await client.query<ChunkRowNoPosition>(
      `INSERT INTO chunks (text, translation, explanation, example, example_translation, level, situation_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, text, translation, explanation, example, example_translation, level, situation_prompt`,
      [input.text, input.translation, input.explanation, input.example, input.exampleTranslation, input.level, input.situationPrompt],
    );
    const chunk = chunkRows[0];
    const { rows: posRows } = await client.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM collection_chunks WHERE collection_id = $1`,
      [collectionId],
    );
    const position = posRows[0].next_position;
    await client.query(`INSERT INTO collection_chunks (collection_id, chunk_id, position) VALUES ($1, $2, $3)`, [collectionId, chunk.id, position]);
    await client.query('COMMIT');
    return { ...chunk, position };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface ChunkPatch {
  text?: string;
  translation?: string;
  explanation?: string | null;
  example?: string | null;
  exampleTranslation?: string | null;
  level?: string;
  situationPrompt?: string | null;
}

export async function updateChunk(id: string, patch: ChunkPatch): Promise<ChunkRowNoPosition | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.text !== undefined) add('text', patch.text);
  if (patch.translation !== undefined) add('translation', patch.translation);
  if (patch.explanation !== undefined) add('explanation', patch.explanation);
  if (patch.example !== undefined) add('example', patch.example);
  if (patch.exampleTranslation !== undefined) add('example_translation', patch.exampleTranslation);
  if (patch.level !== undefined) add('level', patch.level);
  if (patch.situationPrompt !== undefined) add('situation_prompt', patch.situationPrompt);
  if (sets.length === 0) return findChunkByIdAdmin(id);

  sets.push('updated_at = now()');
  const { rows } = await pool.query<ChunkRowNoPosition>(
    `UPDATE chunks SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, text, translation, explanation, example, example_translation, level, situation_prompt`,
    values,
  );
  return rows[0] ?? null;
}

/** ON DELETE CASCADE on both collection_chunks and chunk_progress (see their migrations) means this alone detaches the chunk from every collection and clears any learner progress on it. */
export async function deleteChunk(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM chunks WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Detach only — for a chunk that also belongs to other collections and shouldn't be deleted outright. */
export async function removeChunkFromCollection(collectionId: string, chunkId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM collection_chunks WHERE collection_id = $1 AND chunk_id = $2`, [collectionId, chunkId]);
  return (result.rowCount ?? 0) > 0;
}
