import { findChunkById, type ChunkRow } from './repository.js';

export interface ChunkSummary {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  example: string | null;
  exampleTranslation: string | null;
  level: string;
}

export function toChunkSummary(row: ChunkRow): ChunkSummary {
  return {
    id: row.id,
    text: row.text,
    translation: row.translation,
    explanation: row.explanation,
    example: row.example,
    exampleTranslation: row.example_translation,
    level: row.level,
  };
}

export async function getChunkById(id: string): Promise<ChunkSummary | null> {
  const row = await findChunkById(id);
  return row ? toChunkSummary(row) : null;
}
