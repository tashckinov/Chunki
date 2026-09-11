import { pool } from '../../db/pool.js';

export interface ChunkSentencePart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

export interface ChunkSentenceRow {
  text: string;
  translation: string;
  parts: ChunkSentencePart[];
}

export interface ChunkRow {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  sentences: ChunkSentenceRow[];
  has_dialogue: boolean;
}

// A dialogue row with zero messages counts as "no dialogue" here too — mirrors
// admin/repository.ts's identical HAS_DIALOGUE_SUBQUERY. Scoped to kind='browse':
// this flag drives the "Не знаю" comic / Комиксы tab, not the separate
// "Ситуация" comic (chunk_dialogues.kind='situation').
const HAS_DIALOGUE_SUBQUERY = `EXISTS (
              SELECT 1 FROM chunk_dialogues d
              JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id
              WHERE d.chunk_id = c.id AND d.kind = 'browse'
            ) AS has_dialogue`;

interface RawSentenceRow {
  chunk_id: string;
  sentence_id: string;
  text: string;
  translation: string;
}

interface RawPartRow {
  sentence_id: string;
  text: string;
  explanation_ru: string;
  explanation_en: string;
}

// Batch-fetches every sentence (+ its parts) for a set of chunk ids in two
// flat queries and groups them in application code — mirrors admin/
// repository.ts's identical fetchSentencesForChunks (small, tolerable
// duplication, same posture as the two modules' parallel HAS_DIALOGUE
// queries above).
async function fetchSentencesForChunks(chunkIds: string[]): Promise<Map<string, ChunkSentenceRow[]>> {
  if (chunkIds.length === 0) return new Map();
  const { rows: sentenceRows } = await pool.query<RawSentenceRow>(
    `SELECT chunk_id, id AS sentence_id, text, translation
     FROM chunk_sentences WHERE chunk_id = ANY($1::uuid[]) ORDER BY chunk_id, position`,
    [chunkIds],
  );
  const sentenceIds = sentenceRows.map((r) => r.sentence_id);
  const partsBySentence = new Map<string, ChunkSentencePart[]>();
  if (sentenceIds.length > 0) {
    const { rows: partRows } = await pool.query<RawPartRow>(
      `SELECT sentence_id, text, explanation_ru, explanation_en
       FROM chunk_sentence_parts WHERE sentence_id = ANY($1::uuid[]) ORDER BY sentence_id, position`,
      [sentenceIds],
    );
    for (const p of partRows) {
      const arr = partsBySentence.get(p.sentence_id) ?? [];
      arr.push({ text: p.text, explanationRu: p.explanation_ru, explanationEn: p.explanation_en });
      partsBySentence.set(p.sentence_id, arr);
    }
  }
  const byChunk = new Map<string, ChunkSentenceRow[]>();
  for (const s of sentenceRows) {
    const arr = byChunk.get(s.chunk_id) ?? [];
    arr.push({ text: s.text, translation: s.translation, parts: partsBySentence.get(s.sentence_id) ?? [] });
    byChunk.set(s.chunk_id, arr);
  }
  return byChunk;
}

export async function findChunkById(id: string): Promise<ChunkRow | null> {
  const { rows } = await pool.query<Omit<ChunkRow, 'sentences'>>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.level,
            ${HAS_DIALOGUE_SUBQUERY}
     FROM chunks c
     WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const sentencesByChunk = await fetchSentencesForChunks([rows[0].id]);
  return { ...rows[0], sentences: sentencesByChunk.get(rows[0].id) ?? [] };
}

export async function listChunksForCollection(collectionId: string): Promise<ChunkRow[]> {
  const { rows } = await pool.query<Omit<ChunkRow, 'sentences'>>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.level,
            ${HAS_DIALOGUE_SUBQUERY}
     FROM collection_chunks cc
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE cc.collection_id = $1
     ORDER BY cc.position`,
    [collectionId],
  );
  const sentencesByChunk = await fetchSentencesForChunks(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, sentences: sentencesByChunk.get(r.id) ?? [] }));
}
