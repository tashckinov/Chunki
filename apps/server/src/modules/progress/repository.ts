import { pool } from '../../db/pool.js';

export interface ProgressRow {
  id: string;
  user_id: string;
  chunk_id: string;
  state: string;
  times_reviewed: number;
  times_production_attempted: number;
  times_production_passed: number;
  last_reviewed_at: Date | null;
  last_production_check_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function findProgress(userId: string, chunkId: string): Promise<ProgressRow | null> {
  const { rows } = await pool.query<ProgressRow>(`SELECT * FROM chunk_progress WHERE user_id = $1 AND chunk_id = $2`, [userId, chunkId]);
  return rows[0] ?? null;
}

export async function findProgressForChunks(userId: string, chunkIds: string[]): Promise<ProgressRow[]> {
  if (chunkIds.length === 0) return [];
  const { rows } = await pool.query<ProgressRow>(`SELECT * FROM chunk_progress WHERE user_id = $1 AND chunk_id = ANY($2)`, [userId, chunkIds]);
  return rows;
}

export interface ProgressPatch {
  state: string;
  timesReviewed: number;
  timesProductionAttempted: number;
  timesProductionPassed: number;
  lastReviewedAt: Date | null;
  lastProductionCheckAt: Date | null;
}

/**
 * Always writes absolute values (the caller reads the current row first and
 * computes the next state) rather than SQL increments — simpler, and
 * consistent with how the rest of this app doesn't worry about concurrent
 * double-submission races (e.g. rapid double-swipes) either.
 */
export async function upsertProgress(userId: string, chunkId: string, patch: ProgressPatch): Promise<ProgressRow> {
  const { rows } = await pool.query<ProgressRow>(
    `INSERT INTO chunk_progress (user_id, chunk_id, state, times_reviewed, times_production_attempted, times_production_passed, last_reviewed_at, last_production_check_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, chunk_id) DO UPDATE SET
       state = EXCLUDED.state,
       times_reviewed = EXCLUDED.times_reviewed,
       times_production_attempted = EXCLUDED.times_production_attempted,
       times_production_passed = EXCLUDED.times_production_passed,
       last_reviewed_at = EXCLUDED.last_reviewed_at,
       last_production_check_at = EXCLUDED.last_production_check_at,
       updated_at = now()
     RETURNING *`,
    [userId, chunkId, patch.state, patch.timesReviewed, patch.timesProductionAttempted, patch.timesProductionPassed, patch.lastReviewedAt, patch.lastProductionCheckAt],
  );
  return rows[0];
}

export interface SituationPromptPart {
  text: string;
  explanation_ru: string;
  explanation_en: string;
}

export interface SituationPrompt {
  text: string;
  parts: SituationPromptPart[];
}

export interface ChunkWithSituationsRow {
  id: string;
  text: string;
  translation: string;
  example: string | null;
  situation_prompts: SituationPrompt[];
}

export async function findChunkWithSituationPrompts(chunkId: string): Promise<ChunkWithSituationsRow | null> {
  const { rows } = await pool.query<{ id: string; text: string; translation: string; example: string | null }>(
    `SELECT c.id, c.text, c.translation,
            (SELECT text FROM chunk_sentences WHERE chunk_id = c.id ORDER BY position LIMIT 1) AS example
     FROM chunks c
     WHERE c.id = $1`,
    [chunkId],
  );
  const chunk = rows[0];
  if (!chunk) return null;

  const { rows: promptRows } = await pool.query<{ id: string; prompt: string }>(
    `SELECT id, prompt FROM chunk_situation_prompts WHERE chunk_id = $1 ORDER BY position`,
    [chunkId],
  );
  const promptIds = promptRows.map((r) => r.id);
  const partsByPrompt = new Map<string, SituationPromptPart[]>();
  if (promptIds.length > 0) {
    const { rows: partRows } = await pool.query<{ situation_prompt_id: string; text: string; explanation_ru: string; explanation_en: string }>(
      `SELECT situation_prompt_id, text, explanation_ru, explanation_en
       FROM chunk_situation_prompt_parts WHERE situation_prompt_id = ANY($1::uuid[]) ORDER BY situation_prompt_id, position`,
      [promptIds],
    );
    for (const p of partRows) {
      const arr = partsByPrompt.get(p.situation_prompt_id) ?? [];
      arr.push({ text: p.text, explanation_ru: p.explanation_ru, explanation_en: p.explanation_en });
      partsByPrompt.set(p.situation_prompt_id, arr);
    }
  }
  const situation_prompts: SituationPrompt[] = promptRows.map((p) => ({ text: p.prompt, parts: partsByPrompt.get(p.id) ?? [] }));

  return { ...chunk, situation_prompts };
}

/** Distractor options for the recognition-check MCQ: other chunks' translations, same level preferred. */
export async function findDistractorTranslations(excludeChunkId: string, level: string, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ translation: string }>(
    `SELECT translation FROM chunks WHERE id != $1 AND level = $2 ORDER BY random() LIMIT $3`,
    [excludeChunkId, level, limit],
  );
  if (rows.length >= limit) return rows.map((r) => r.translation);

  // Not enough same-level chunks — top up from any level.
  const { rows: fallback } = await pool.query<{ translation: string }>(
    `SELECT translation FROM chunks WHERE id != $1 ORDER BY random() LIMIT $2`,
    [excludeChunkId, limit],
  );
  return fallback.map((r) => r.translation);
}
