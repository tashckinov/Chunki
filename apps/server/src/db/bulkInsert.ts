/**
 * Builds a multi-row `VALUES ($1,$2),($3,$4),...` clause + the flat params
 * array to go with it, given each row's values in column order — for a
 * single `INSERT INTO t (...) VALUES <placeholders>` instead of one query
 * per row. Returns null for an empty `rows` (nothing to insert) so callers
 * skip the query entirely rather than sending `VALUES ()`.
 */
export function buildValuesClause(rows: unknown[][]): { placeholders: string; values: unknown[] } | null {
  if (rows.length === 0) return null;
  const values: unknown[] = [];
  const placeholders = rows
    .map(
      (row) =>
        `(${row
          .map((v) => {
            values.push(v);
            return `$${values.length}`;
          })
          .join(', ')})`,
    )
    .join(', ');
  return { placeholders, values };
}
