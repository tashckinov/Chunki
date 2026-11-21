import { BUILTIN_PLACEMENT_TEST, type PlacementTestDefinition } from '@app/shared';
import { pool } from '../../db/pool.js';

interface VariantRow {
  id: string;
  title: string;
  definition: PlacementTestDefinition;
  active: boolean;
  created_at: Date;
}

export async function listGrammarTests() {
  const { rows } = await pool.query<VariantRow>(
    'SELECT * FROM grammar_test_variants WHERE active ORDER BY created_at DESC',
  );
  return [
    ...rows,
    { id: 'builtin', title: 'Стандартный тест', definition: BUILTIN_PLACEMENT_TEST, active: rows.length === 0, created_at: null },
  ];
}

export async function publishGrammarTest(title: string, definition: PlacementTestDefinition, replacesId?: string) {
  if (!replacesId || replacesId === 'builtin') {
    const { rows } = await pool.query<VariantRow>(
      'INSERT INTO grammar_test_variants (title, definition) VALUES ($1, $2) RETURNING *',
      [title, definition],
    );
    return rows[0];
  }

  // Updating never changes the questions in an existing learner's draft.
  const { rows } = await pool.query<VariantRow>(`
    WITH replaced AS (
      UPDATE grammar_test_variants SET active = false WHERE id = $1 AND active RETURNING id
    )
    INSERT INTO grammar_test_variants (title, definition)
    SELECT $2, $3::jsonb FROM replaced RETURNING *
  `, [replacesId, title, definition]);
  return rows[0] ?? null;
}

export async function archiveGrammarTest(id: string) {
  const result = await pool.query('UPDATE grammar_test_variants SET active = false WHERE id = $1 AND active', [id]);
  return result.rowCount === 1;
}

export async function chooseGrammarTest(previousId?: string) {
  const { rows } = await pool.query<Pick<VariantRow, 'id' | 'definition'>>(
    'SELECT id, definition FROM grammar_test_variants WHERE active ORDER BY (id = $1::uuid) NULLS LAST, random() LIMIT 1',
    [previousId ?? null],
  );
  const { id, definition } = rows[0] ?? { id: 'builtin', definition: BUILTIN_PLACEMENT_TEST };
  const { mcq, ...rest } = definition;
  return { id, definition: { ...rest, mcq: mcq.map(({ n, q, options }) => ({ n, q, options })) } };
}

export async function findGrammarTest(id?: string): Promise<PlacementTestDefinition | null> {
  if (!id || id === 'builtin') return BUILTIN_PLACEMENT_TEST;
  const { rows } = await pool.query<{ definition: PlacementTestDefinition }>(
    'SELECT definition FROM grammar_test_variants WHERE id = $1',
    [id],
  );
  return rows[0]?.definition ?? null;
}
