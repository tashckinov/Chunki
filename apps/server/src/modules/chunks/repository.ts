import { pool } from '../../db/pool.js';

export interface ChunkRow {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  example_translation: string | null;
  level: string;
}

export async function findChunkById(id: string): Promise<ChunkRow | null> {
  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, text, translation, explanation, example, example_translation, level
     FROM chunks
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listChunksForCollection(collectionId: string): Promise<ChunkRow[]> {
  const { rows } = await pool.query<ChunkRow>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.example, c.example_translation, c.level
     FROM collection_chunks cc
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE cc.collection_id = $1
     ORDER BY cc.position`,
    [collectionId],
  );
  return rows;
}
