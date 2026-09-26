import { pool } from '../../db/pool.js';

export interface GroupRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

const GROUP_COLUMNS = 'id, key, name, description, created_at, updated_at';

export async function listGroups(): Promise<GroupRow[]> {
  const { rows } = await pool.query<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM chunk_semantic_groups ORDER BY name`);
  return rows;
}

export async function findGroupById(id: string): Promise<GroupRow | null> {
  const { rows } = await pool.query<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM chunk_semantic_groups WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findGroupByKey(key: string): Promise<GroupRow | null> {
  const { rows } = await pool.query<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM chunk_semantic_groups WHERE key = $1`, [key]);
  return rows[0] ?? null;
}

export interface GroupInput {
  key: string;
  name: string;
  description: string | null;
}

/** Unique on `key` — a duplicate key throws the raw Postgres unique-violation error, left to the caller (service.ts) to turn into a friendly result. */
export async function createGroup(input: GroupInput): Promise<GroupRow> {
  const { rows } = await pool.query<GroupRow>(
    `INSERT INTO chunk_semantic_groups (key, name, description) VALUES ($1, $2, $3) RETURNING ${GROUP_COLUMNS}`,
    [input.key, input.name, input.description],
  );
  return rows[0];
}

export async function updateGroup(id: string, input: GroupInput): Promise<GroupRow | null> {
  const { rows } = await pool.query<GroupRow>(
    `UPDATE chunk_semantic_groups SET key = $2, name = $3, description = $4, updated_at = now() WHERE id = $1 RETURNING ${GROUP_COLUMNS}`,
    [id, input.key, input.name, input.description],
  );
  return rows[0] ?? null;
}

/** ON DELETE CASCADE on chunk_semantic_group_members, ON DELETE SET NULL on the situation-prompt/dialogue links — a deleted group just leaves those unclassified again. */
export async function deleteGroup(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM chunk_semantic_groups WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function countMembersByGroup(): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ group_id: string; count: string }>(
    `SELECT group_id, COUNT(*)::text AS count FROM chunk_semantic_group_members GROUP BY group_id`,
  );
  return new Map(rows.map((r) => [r.group_id, Number(r.count)]));
}

export interface BasicChunkRow {
  id: string;
  text: string;
  translation: string;
}

/** Every chunk in the library, regardless of collection — the admin "Типы" section manages chunk↔group membership across the whole library, not scoped to one collection like ContentSection.tsx's chunk lists. */
export async function listAllChunksBasic(): Promise<BasicChunkRow[]> {
  const { rows } = await pool.query<BasicChunkRow>(`SELECT id, text, translation FROM chunks ORDER BY text`);
  return rows;
}

/** groupId per chunk, batched — for the admin chunk list and for building the AI-classification export. */
export async function listGroupIdsForAllChunks(): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ chunk_id: string; group_id: string }>(`SELECT chunk_id, group_id FROM chunk_semantic_group_members`);
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.chunk_id) ?? [];
    arr.push(r.group_id);
    map.set(r.chunk_id, arr);
  }
  return map;
}

/** The judge's candidate list for a situation linked to this group — just enough to build ProductionCheckCandidateChunk[] (see progress/service.ts). */
export async function listGroupMemberChunksBasic(groupId: string): Promise<BasicChunkRow[]> {
  const { rows } = await pool.query<BasicChunkRow>(
    `SELECT c.id, c.text, c.translation
     FROM chunk_semantic_group_members m
     JOIN chunks c ON c.id = m.chunk_id
     WHERE m.group_id = $1
     ORDER BY c.text`,
    [groupId],
  );
  return rows;
}

export async function chunkExists(chunkId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM chunks WHERE id = $1`, [chunkId]);
  return rows.length > 0;
}

/** Full-replace for one chunk's group membership — the admin's per-chunk editor and the AI-classification apply step both just say "this chunk's groups are now exactly this set." */
export async function setChunkGroups(chunkId: string, groupIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM chunk_semantic_group_members WHERE chunk_id = $1`, [chunkId]);
    for (const groupId of groupIds) {
      await client.query(`INSERT INTO chunk_semantic_group_members (group_id, chunk_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [groupId, chunkId]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
