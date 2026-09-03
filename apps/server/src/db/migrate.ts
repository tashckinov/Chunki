import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/db/migrate.js -> apps/server/migrations (source layout mirrors this
// from src/db/migrate.ts, so the same relative path works run via tsx too).
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function main() {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(`Nothing to do — ${files.length} migration(s) already applied.`);
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        console.log(`Applying ${file} ...`);
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Migration ${file} failed and was rolled back.`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
