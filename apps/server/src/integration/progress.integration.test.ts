// Integration tests against a REAL Postgres — run with `npm run test:integration`
// after `docker compose up -d postgres` and running migrations (see README).
// Not part of the default `npm test` run.
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { findOrCreateUserFromProvider } from '../modules/users/service.js';
import { recordSort, getProgressForChunks } from '../modules/progress/service.js';
import { upsertProgress, findProgress } from '../modules/progress/repository.js';

function unique() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function insertUser() {
  const suffix = unique();
  const user = await findOrCreateUserFromProvider({
    provider: 'google',
    providerUserId: `it-progress-user-${suffix}`,
    email: `it-progress-${suffix}@example.com`,
    displayName: 'Progress Integration Test User',
    providerEmail: `it-progress-${suffix}@example.com`,
  });
  return user.id;
}

async function insertChunk(text: string, situationPrompt: string | null = null) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chunks (text, translation, level, situation_prompt) VALUES ($1, $2, 'A2', $3) RETURNING id`,
    [text, `translation of ${text}`, situationPrompt],
  );
  return rows[0].id;
}

afterAll(async () => {
  await pool.end();
});

describe('chunk_progress (real database)', () => {
  it('recordSort creates a row that upserts on a later sort of the same chunk', async () => {
    const userId = await insertUser();
    const chunkId = await insertChunk(`it-sort-${unique()}`);

    const first = await recordSort(userId, chunkId, 'dont');
    expect(first.state).toBe('unknown');
    expect(first.timesReviewed).toBe(1);

    const second = await recordSort(userId, chunkId, 'know');
    expect(second.state).toBe('self_known');
    expect(second.timesReviewed).toBe(2);

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM chunk_progress WHERE user_id = $1 AND chunk_id = $2', [
      userId,
      chunkId,
    ]);
    expect(rows[0].count).toBe(1);
  });

  it('enforces UNIQUE(user_id, chunk_id) — a raw duplicate insert is rejected', async () => {
    const userId = await insertUser();
    const chunkId = await insertChunk(`it-unique-${unique()}`);

    await pool.query(
      `INSERT INTO chunk_progress (user_id, chunk_id, state, times_reviewed, times_production_attempted, times_production_passed)
       VALUES ($1, $2, 'unknown', 1, 0, 0)`,
      [userId, chunkId],
    );

    await expect(
      pool.query(
        `INSERT INTO chunk_progress (user_id, chunk_id, state, times_reviewed, times_production_attempted, times_production_passed)
         VALUES ($1, $2, 'unknown', 1, 0, 0)`,
        [userId, chunkId],
      ),
    ).rejects.toThrow(/duplicate key value/i);
  });

  it('getProgressForChunks batches lookups and omits chunks with no row', async () => {
    const userId = await insertUser();
    const chunkA = await insertChunk(`it-batch-a-${unique()}`);
    const chunkB = await insertChunk(`it-batch-b-${unique()}`);
    const chunkC = await insertChunk(`it-batch-c-${unique()}`); // never sorted

    await recordSort(userId, chunkA, 'know');
    await recordSort(userId, chunkB, 'bury');

    const progress = await getProgressForChunks(userId, [chunkA, chunkB, chunkC]);
    expect(Object.keys(progress).sort()).toEqual([chunkA, chunkB].sort());
    expect(progress[chunkA].state).toBe('self_known');
    expect(progress[chunkB].state).toBe('unsure');
  });

  it('cascade-deletes chunk_progress rows when the chunk is deleted', async () => {
    const userId = await insertUser();
    const chunkId = await insertChunk(`it-cascade-chunk-${unique()}`);
    await recordSort(userId, chunkId, 'know');

    await pool.query('DELETE FROM chunks WHERE id = $1', [chunkId]);

    expect(await findProgress(userId, chunkId)).toBeNull();
  });

  it('cascade-deletes chunk_progress rows when the user is deleted', async () => {
    const userId = await insertUser();
    const chunkId = await insertChunk(`it-cascade-user-${unique()}`);
    await recordSort(userId, chunkId, 'know');

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM chunk_progress WHERE user_id = $1', [userId]);
    expect(rows[0].count).toBe(0);
  });

  it('upsertProgress overwrites the row rather than accumulating a second one', async () => {
    const userId = await insertUser();
    const chunkId = await insertChunk(`it-upsert-${unique()}`);

    await upsertProgress(userId, chunkId, {
      state: 'self_known',
      timesReviewed: 1,
      timesProductionAttempted: 0,
      timesProductionPassed: 0,
      lastReviewedAt: new Date(),
      lastProductionCheckAt: null,
    });
    const updated = await upsertProgress(userId, chunkId, {
      state: 'active',
      timesReviewed: 1,
      timesProductionAttempted: 1,
      timesProductionPassed: 1,
      lastReviewedAt: new Date(),
      lastProductionCheckAt: new Date(),
    });

    expect(updated.state).toBe('active');
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM chunk_progress WHERE user_id = $1 AND chunk_id = $2', [
      userId,
      chunkId,
    ]);
    expect(rows[0].count).toBe(1);
  });
});
