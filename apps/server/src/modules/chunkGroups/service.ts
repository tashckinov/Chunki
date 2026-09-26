import {
  listGroups as repoListGroups,
  findGroupByKey as repoFindGroupByKey,
  createGroup as repoCreateGroup,
  updateGroup as repoUpdateGroup,
  deleteGroup as repoDeleteGroup,
  countMembersByGroup,
  listAllChunksBasic,
  listGroupIdsForAllChunks,
  setChunkGroups as repoSetChunkGroups,
  chunkExists,
  type GroupRow,
  type GroupInput,
} from './repository.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

export interface AdminGroup {
  id: string;
  key: string;
  name: string;
  description: string | null;
  memberCount: number;
  updatedAt: string;
}

function toAdminGroup(row: GroupRow, memberCount: number): AdminGroup {
  return { id: row.id, key: row.key, name: row.name, description: row.description, memberCount, updatedAt: row.updated_at.toISOString() };
}

export async function listGroupsForAdmin(): Promise<AdminGroup[]> {
  const [rows, counts] = await Promise.all([repoListGroups(), countMembersByGroup()]);
  return rows.map((r) => toAdminGroup(r, counts.get(r.id) ?? 0));
}

export type SaveGroupResult = { kind: 'ok'; group: AdminGroup } | { kind: 'duplicate_key' } | { kind: 'not_found' };

export async function createGroupForAdmin(input: GroupInput): Promise<SaveGroupResult> {
  try {
    const row = await repoCreateGroup(input);
    return { kind: 'ok', group: toAdminGroup(row, 0) };
  } catch (err) {
    if (isUniqueViolation(err)) return { kind: 'duplicate_key' };
    throw err;
  }
}

export async function updateGroupForAdmin(id: string, input: GroupInput): Promise<SaveGroupResult> {
  try {
    const row = await repoUpdateGroup(id, input);
    if (!row) return { kind: 'not_found' };
    const counts = await countMembersByGroup();
    return { kind: 'ok', group: toAdminGroup(row, counts.get(row.id) ?? 0) };
  } catch (err) {
    if (isUniqueViolation(err)) return { kind: 'duplicate_key' };
    throw err;
  }
}

export async function deleteGroupForAdmin(id: string): Promise<boolean> {
  return repoDeleteGroup(id);
}

export interface AdminChunkWithGroups {
  id: string;
  text: string;
  translation: string;
  groupIds: string[];
}

/** The whole chunk library + current group membership — backs both the manual per-chunk editor and the AI-classification export in ChunkGroupsSection.tsx. */
export async function listChunksWithGroupsForAdmin(): Promise<AdminChunkWithGroups[]> {
  const [chunks, groupIdsByChunk] = await Promise.all([listAllChunksBasic(), listGroupIdsForAllChunks()]);
  return chunks.map((c) => ({ id: c.id, text: c.text, translation: c.translation, groupIds: groupIdsByChunk.get(c.id) ?? [] }));
}

export type SetChunkGroupsResult = { kind: 'ok' } | { kind: 'not_found' };

export async function setChunkGroupsForAdmin(chunkId: string, groupIds: string[]): Promise<SetChunkGroupsResult> {
  if (!(await chunkExists(chunkId))) return { kind: 'not_found' };
  await repoSetChunkGroups(chunkId, groupIds);
  return { kind: 'ok' };
}

// ---- AI-assisted mass classification (paste-in-JSON, same "copy prompt / paste
// result" pattern as lib/chunkAiPrompt.ts on the frontend — no server-side AI
// call here, this only applies whatever the admin already parsed/reviewed) ----

export interface ProposedNewGroup {
  key: string;
  name: string;
  description: string | null;
}

export interface ProposedAssignment {
  chunkId: string;
  groupKeys: string[];
}

export interface ApplyClassificationInput {
  newGroups: ProposedNewGroup[];
  assignments: ProposedAssignment[];
}

export interface ApplyClassificationResult {
  createdGroups: AdminGroup[];
  updatedChunkCount: number;
  /** Keys referenced by an assignment that matched neither an existing group nor one of newGroups — skipped rather than failing the whole apply. */
  skippedGroupKeys: string[];
}

export async function applyClassificationForAdmin(input: ApplyClassificationInput): Promise<ApplyClassificationResult> {
  const keyToId = new Map<string, string>();
  for (const g of await repoListGroups()) keyToId.set(g.key, g.id);

  const createdGroups: AdminGroup[] = [];
  for (const proposed of input.newGroups) {
    if (keyToId.has(proposed.key)) continue; // already exists (admin may have re-run classification) — reuse it, don't fail
    const existing = await repoFindGroupByKey(proposed.key);
    if (existing) {
      keyToId.set(proposed.key, existing.id);
      continue;
    }
    const row = await repoCreateGroup({ key: proposed.key, name: proposed.name, description: proposed.description });
    keyToId.set(row.key, row.id);
    createdGroups.push(toAdminGroup(row, 0));
  }

  const skippedGroupKeys = new Set<string>();
  let updatedChunkCount = 0;
  for (const assignment of input.assignments) {
    const groupIds: string[] = [];
    for (const key of assignment.groupKeys) {
      const id = keyToId.get(key);
      if (id) groupIds.push(id);
      else skippedGroupKeys.add(key);
    }
    if (!(await chunkExists(assignment.chunkId))) continue;
    await repoSetChunkGroups(assignment.chunkId, groupIds);
    updatedChunkCount += 1;
  }

  return { createdGroups, updatedChunkCount, skippedGroupKeys: [...skippedGroupKeys] };
}

// ---- used by progress/service.ts when judging a production check ----

export { listGroupMemberChunksBasic } from './repository.js';
