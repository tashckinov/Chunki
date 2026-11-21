import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../../db/pool.js';

function hash(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

interface TimecodeSummary {
  id: string;
  codeHint: string;
  tariffName: string | null;
  months: number;
  maxUses: number;
  usedCount: number;
  createdAt: Date;
}

export async function listTimecodes(): Promise<TimecodeSummary[]> {
  const { rows } = await pool.query<TimecodeSummary>(`
    SELECT c.id, c.code_hint AS "codeHint", t.name AS "tariffName",
           c.months, c.max_uses AS "maxUses", c.used_count AS "usedCount", c.created_at AS "createdAt"
    FROM subscription_timecodes c LEFT JOIN subscription_tariffs t ON t.id = c.tariff_id
    ORDER BY c.created_at DESC LIMIT 100
  `);
  return rows;
}

export async function createTimecode(tariffId: string, months: number, maxUses: number) {
  const raw = randomBytes(12).toString('hex').toUpperCase();
  const code = raw.match(/.{6}/g)!.join('-');
  const { rows } = await pool.query<TimecodeSummary>(`
    INSERT INTO subscription_timecodes (code_hash, code_hint, tariff_id, months, max_uses)
    SELECT $1, $2, id, $4, $5 FROM subscription_tariffs WHERE id = $3 AND NOT is_default
    RETURNING id, code_hint AS "codeHint",
              (SELECT name FROM subscription_tariffs WHERE id = $3) AS "tariffName",
              months, max_uses AS "maxUses", used_count AS "usedCount", created_at AS "createdAt"
  `, [hash(raw), raw.slice(-6), tariffId, months, maxUses]);
  return rows[0] ? { ...rows[0], code } : null;
}

type Redemption =
  | { kind: 'ok'; premiumUntil: string; isPremium: true }
  | { kind: 'invalid_code' | 'already_redeemed' | 'code_exhausted' | 'different_active_tariff' };

export async function redeemTimecode(userId: string, input: string): Promise<Redemption> {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{24}$/.test(code)) return { kind: 'invalid_code' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize redemptions for this account, and lock the code so its last use
    // cannot be claimed by two accounts at once.
    const account = (await client.query<{ active: boolean; tariff_id: string | null }>(
      'SELECT premium_until > now() AS active, current_tariff_id AS tariff_id FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    )).rows[0];
    const timecode = (await client.query<{ id: string; tariff_id: string | null; months: number; max_uses: number; used_count: number }>(
      'SELECT id, tariff_id, months, max_uses, used_count FROM subscription_timecodes WHERE code_hash = $1 FOR UPDATE',
      [hash(code)],
    )).rows[0];

    let result: Redemption;
    if (!account || !timecode?.tariff_id) {
      result = { kind: 'invalid_code' };
    } else {
      const prior = await client.query(
        'SELECT 1 FROM subscription_timecode_redemptions WHERE timecode_id = $1 AND user_id = $2',
        [timecode.id, userId],
      );
      if (prior.rowCount) {
        result = { kind: 'already_redeemed' };
      } else if (timecode.used_count >= timecode.max_uses) {
        result = { kind: 'code_exhausted' };
      } else if (account.active && account.tariff_id !== timecode.tariff_id) {
        result = { kind: 'different_active_tariff' };
      } else {
        const { rows: [updated] } = await client.query<{ premium_until: Date }>(`
          UPDATE users
          SET premium_until = ((GREATEST(premium_until, now()) AT TIME ZONE 'UTC')
                                + make_interval(months => $3)) AT TIME ZONE 'UTC',
              current_tariff_id = $2, updated_at = now()
          WHERE id = $1 RETURNING premium_until
        `, [userId, timecode.tariff_id, timecode.months]);
        await client.query(
          `INSERT INTO subscription_timecode_redemptions (timecode_id, user_id, premium_until)
           SELECT $1, id, premium_until FROM users WHERE id = $2`,
          [timecode.id, userId],
        );
        await client.query('UPDATE subscription_timecodes SET used_count = used_count + 1 WHERE id = $1', [timecode.id]);
        result = { kind: 'ok', premiumUntil: updated.premium_until.toISOString(), isPremium: true };
      }
    }

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
