import { pool } from '../../db/pool.js';

export interface NewAiCallLog {
  userId: string | null;
  chunkId: string | null;
  provider: string;
  model: string | null;
  request: unknown;
  response: unknown | null;
  error: string | null;
  durationMs: number;
}

export async function recordAiCallLog(log: NewAiCallLog): Promise<void> {
  await pool.query(
    `INSERT INTO ai_call_logs (user_id, chunk_id, provider, model, request, response, error, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [log.userId, log.chunkId, log.provider, log.model, JSON.stringify(log.request), log.response === null ? null : JSON.stringify(log.response), log.error, log.durationMs],
  );
}

export interface AiCallLogRow {
  id: string;
  user_id: string | null;
  chunk_id: string | null;
  provider: string;
  model: string | null;
  request: unknown;
  response: unknown | null;
  error: string | null;
  duration_ms: number;
  created_at: Date;
  user_email: string | null;
  chunk_text: string | null;
}

export async function listAiCallLogs(limit: number): Promise<AiCallLogRow[]> {
  const { rows } = await pool.query<AiCallLogRow>(
    `SELECT l.id, l.user_id, l.chunk_id, l.provider, l.model, l.request, l.response, l.error, l.duration_ms, l.created_at,
            u.email AS user_email, c.text AS chunk_text
     FROM ai_call_logs l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN chunks c ON c.id = l.chunk_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
