// Integration tests against a REAL Postgres — run with `npm run test:integration`
// after `docker compose up -d postgres` and running migrations (see README).
// Not part of the default `npm test` run.
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { createUserWithCredential, findCredentialByCredentialId, updateCredentialCounter } from '../modules/auth/webauthnCredentials.js';

function uniqueCredentialId() {
  return `integration-cred-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterAll(async () => {
  await pool.end();
});

describe('createUserWithCredential (real database)', () => {
  it('creates exactly one users row and one webauthn_credentials row, transactionally', async () => {
    const credentialId = uniqueCredentialId();
    const user = await createUserWithCredential({
      credentialId,
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 0,
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
    });

    expect(user.email).toBeNull();
    expect(user.display_name).toBeNull();

    const { rows: userRows } = await pool.query('SELECT count(*)::int AS count FROM users WHERE id = $1', [user.id]);
    expect(userRows[0].count).toBe(1);

    const { rows: credRows } = await pool.query('SELECT count(*)::int AS count FROM webauthn_credentials WHERE credential_id = $1', [
      credentialId,
    ]);
    expect(credRows[0].count).toBe(1);
  });

  it('rejects a duplicate credential_id (UNIQUE constraint)', async () => {
    const credentialId = uniqueCredentialId();
    await createUserWithCredential({
      credentialId,
      publicKey: new Uint8Array([9]),
      counter: 0,
      transports: null,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    await expect(
      createUserWithCredential({
        credentialId,
        publicKey: new Uint8Array([9]),
        counter: 0,
        transports: null,
        deviceType: 'singleDevice',
        backedUp: false,
      }),
    ).rejects.toThrow();
  });
});

describe('findCredentialByCredentialId / updateCredentialCounter (real database)', () => {
  it('round-trips a stored credential and persists a counter bump', async () => {
    const credentialId = uniqueCredentialId();
    const publicKey = new Uint8Array([5, 6, 7, 8, 9]);
    const user = await createUserWithCredential({
      credentialId,
      publicKey,
      counter: 1,
      transports: ['internal', 'hybrid'],
      deviceType: 'multiDevice',
      backedUp: true,
    });

    const found = await findCredentialByCredentialId(credentialId);
    expect(found?.userId).toBe(user.id);
    expect(found?.counter).toBe(1);
    expect(Array.from(found?.publicKey ?? [])).toEqual(Array.from(publicKey));
    expect(found?.transports).toEqual(['internal', 'hybrid']);

    await updateCredentialCounter(credentialId, 2);
    const updated = await findCredentialByCredentialId(credentialId);
    expect(updated?.counter).toBe(2);
  });

  it('returns null for an unknown credential id', async () => {
    expect(await findCredentialByCredentialId('does-not-exist')).toBeNull();
  });
});
