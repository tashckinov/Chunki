import { findChunkById, type ChunkRow, type ChunkSentenceRow } from './repository.js';

export interface ChunkSummary {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  sentences: ChunkSentenceRow[];
  hasDialogue: boolean;
}

export function toChunkSummary(row: ChunkRow): ChunkSummary {
  return {
    id: row.id,
    text: row.text,
    translation: row.translation,
    explanation: row.explanation,
    level: row.level,
    sentences: row.sentences,
    hasDialogue: row.has_dialogue,
  };
}

export async function getChunkById(id: string): Promise<ChunkSummary | null> {
  const row = await findChunkById(id);
  return row ? toChunkSummary(row) : null;
}
