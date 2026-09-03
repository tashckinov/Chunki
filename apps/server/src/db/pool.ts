import pg from 'pg';
import { loadEnv } from '../config/env.js';

export const pool = new pg.Pool({ connectionString: loadEnv().DATABASE_URL });

/**
 * Retries a trivial query until Postgres answers or we give up. Docker
 * Compose's healthcheck + depends_on already delay container start until
 * Postgres is healthy, but this also covers running the server outside
 * Compose (or Postgres restarting later) — it fails loudly instead of
 * letting every request hit an opaque connection error.
 */
export async function waitForDatabase(retries = 10, delayMs = 1000): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Could not connect to PostgreSQL after ${retries} attempts: ${message}`);
}
