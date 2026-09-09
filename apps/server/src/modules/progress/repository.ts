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

export interface ChunkWithSituationRow {
  id: string;
  text: string;
  translation: string;
  example: string | null;
  situation_prompt: string | null;
}

export async function findChunkWithSituation(chunkId: string): Promise<ChunkWithSituationRow | null> {
  const { rows } = await pool.query<ChunkWithSituationRow>(
    `SELECT id, text, translation, example, situation_prompt FROM chunks WHERE id = $1`,
    [chunkId],
  );
  return rows[0] ?? null;
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
