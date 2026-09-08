import { pool } from '../../db/pool.js';
import type { UserRow } from '../users/repository.js';

export interface NewUserWithCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
}

/**
 * Passkey registration has no email/provider identity the way OAuth does —
 * this creates a brand-new, otherwise-empty user row bound only to the new
 * credential. Kept out of auth_identities/findOrCreateUserFromProvider
 * (OAuth-shaped, keyed by (provider, provider_user_id)): webauthn_credentials
 * already plays that lookup-table role, keyed by credential_id instead, with
 * room for the WebAuthn-specific fields auth_identities has none for.
 */
export async function createUserWithCredential(params: NewUserWithCredential): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (email, display_name) VALUES (NULL, NULL)
       RETURNING id, email, display_name, created_at, updated_at, last_login_at`,
    );
    const user = rows[0];
    await client.query(
      `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_type, backed_up)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, params.credentialId, Buffer.from(params.publicKey), params.counter, params.transports, params.deviceType, params.backedUp],
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

export interface CredentialRow {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

export async function findCredentialByCredentialId(credentialId: string): Promise<CredentialRow | null> {
  const { rows } = await pool.query<{ credential_id: string; user_id: string; public_key: Buffer; counter: string; transports: string[] | null }>(
    `SELECT credential_id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE credential_id = $1`,
    [credentialId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: Number(row.counter),
    transports: row.transports ?? undefined,
  };
}

export async function updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
  await pool.query(`UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE credential_id = $2`, [counter, credentialId]);
}
