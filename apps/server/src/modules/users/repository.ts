import { pool } from '../../db/pool.js';

export interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date;
}

export async function findUserByProviderIdentity(provider: string, providerUserId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.display_name, u.created_at, u.updated_at, u.last_login_at
     FROM users u
     JOIN auth_identities ai ON ai.user_id = u.id
     WHERE ai.provider = $1 AND ai.provider_user_id = $2`,
    [provider, providerUserId],
  );
  return rows[0] ?? null;
}

export interface NewUserWithIdentity {
  email: string | null;
  displayName: string | null;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
}

export async function createUserWithIdentity(params: NewUserWithIdentity): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2)
       RETURNING id, email, display_name, created_at, updated_at, last_login_at`,
      [params.email, params.displayName],
    );
    const user = rows[0];
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_user_id, provider_email) VALUES ($1, $2, $3, $4)`,
      [user.id, params.provider, params.providerUserId, params.providerEmail],
    );
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function touchLastLogin(userId: string): Promise<Date> {
  const { rows } = await pool.query<{ last_login_at: Date }>(
    `UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING last_login_at`,
    [userId],
  );
  return rows[0].last_login_at;
}
