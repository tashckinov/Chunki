import { getJson, postJson, patchJson, deleteJson } from './collections';

export interface AdminChunkGroup {
  id: string;
  key: string;
  name: string;
  description: string | null;
  memberCount: number;
  updatedAt: string;
}

export interface ChunkGroupInput {
  key: string;
  name: string;
  description: string | null;
}

export async function fetchChunkGroups(): Promise<AdminChunkGroup[]> {
  const data = await getJson<{ groups: AdminChunkGroup[] }>('/api/admin/chunk-groups');
  return data.groups;
}

export async function createChunkGroup(input: ChunkGroupInput): Promise<AdminChunkGroup> {
  const data = await postJson<{ group: AdminChunkGroup }>('/api/admin/chunk-groups', input);
  return data.group;
}

export async function updateChunkGroup(id: string, input: ChunkGroupInput): Promise<AdminChunkGroup> {
  const data = await patchJson<{ group: AdminChunkGroup }>(`/api/admin/chunk-groups/${id}`, input);
  return data.group;
}

export async function deleteChunkGroup(id: string): Promise<void> {
  await deleteJson(`/api/admin/chunk-groups/${id}`);
}

export interface AdminChunkWithGroups {
  id: string;
  text: string;
  translation: string;
  groupIds: string[];
}

/** The whole chunk library (every collection), each with its current group membership — backs the manual per-chunk editor and the AI-classification export/apply flow below. */
export async function fetchChunksWithGroups(): Promise<AdminChunkWithGroups[]> {
  const data = await getJson<{ chunks: AdminChunkWithGroups[] }>('/api/admin/chunk-groups/chunks');
  return data.chunks;
}

export async function setChunkGroups(chunkId: string, groupIds: string[]): Promise<void> {
  await patchJson(`/api/admin/chunk-groups/chunks/${chunkId}`, { groupIds });
}

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
  createdGroups: AdminChunkGroup[];
  updatedChunkCount: number;
  skippedGroupKeys: string[];
}

export async function applyChunkClassification(input: ApplyClassificationInput): Promise<ApplyClassificationResult> {
  return postJson('/api/admin/chunk-groups/apply-classification', input);
}
