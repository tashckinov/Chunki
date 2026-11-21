import type { PlacementTestDefinition } from '@app/shared';
import { deleteJson, getJson, postJson } from './collections';

const PATH = '/api/admin/grammar-tests';

export interface AdminGrammarTest {
  id: string;
  title: string;
  definition: PlacementTestDefinition;
  active: boolean;
}

export async function fetchGrammarTests() {
  return (await getJson<{ variants: AdminGrammarTest[] }>(PATH)).variants;
}

export function publishGrammarTest(title: string, definition: PlacementTestDefinition, replacesId?: string) {
  return postJson<{ variant: AdminGrammarTest }>(PATH, { title, definition, replacesId });
}

export function archiveGrammarTest(id: string) {
  return deleteJson<{ ok: true }>(`${PATH}/${id}`);
}
