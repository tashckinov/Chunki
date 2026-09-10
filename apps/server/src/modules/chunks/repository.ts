import { pool } from '../../db/pool.js';

export interface ChunkRow {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  example_translation: string | null;
  level: string;
  has_dialogue: boolean;
}

// A dialogue row with zero messages counts as "no dialogue" here too — mirrors
// admin/repository.ts's identical HAS_DIALOGUE_SUBQUERY.
const HAS_DIALOGUE_SUBQUERY = `EXISTS (
              SELECT 1 FROM chunk_dialogues d
              JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id
              WHERE d.chunk_id = c.id
            ) AS has_dialogue`;

export async function findChunkById(id: string): Promise<ChunkRow | null> {
  const { rows } = await pool.query<ChunkRow>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.example, c.example_translation, c.level,
            ${HAS_DIALOGUE_SUBQUERY}
     FROM chunks c
     WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listChunksForCollection(collectionId: string): Promise<ChunkRow[]> {
  const { rows } = await pool.query<ChunkRow>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.example, c.example_translation, c.level,
            ${HAS_DIALOGUE_SUBQUERY}
     FROM collection_chunks cc
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE cc.collection_id = $1
     ORDER BY cc.position`,
    [collectionId],
  );
  return rows;
}
