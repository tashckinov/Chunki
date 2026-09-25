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

export interface AccountStatus {
  premiumUntil: Date | null;
  isAdmin: boolean;
  currentTariffId: string | null;
  dailyChecksUsed: number;
  /** ISO date (YYYY-MM-DD) the count above corresponds to, or null if never used — compare against today's UTC date to know if it's stale. */
  dailyChecksDate: string | null;
}

export async function findAccountStatus(userId: string): Promise<AccountStatus | null> {
  const { rows } = await pool.query<{
    premium_until: Date | null;
    is_admin: boolean;
    current_tariff_id: string | null;
    daily_checks_used: number;
    daily_checks_date: string | null;
  }>(`SELECT premium_until, is_admin, current_tariff_id, daily_checks_used, daily_checks_date FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) return null;
  return {
    premiumUntil: rows[0].premium_until,
    isAdmin: rows[0].is_admin,
    currentTariffId: rows[0].current_tariff_id,
    dailyChecksUsed: rows[0].daily_checks_used,
    dailyChecksDate: rows[0].daily_checks_date,
  };
}

/**
 * Atomic — rolls the counter over to 1 if the stored date isn't today (UTC),
 * otherwise increments. Always resolve the effective tariff and compare its
 * dailyCheckLimit against the READ from findAccountStatus (with the same
 * stale-date rollover applied in application code) BEFORE calling this —
 * this call itself always succeeds regardless of any limit, same as the old
 * incrementProductionChecksUsed it replaces.
 */
export async function bumpDailyChecksUsed(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET daily_checks_used = CASE WHEN daily_checks_date IS DISTINCT FROM (now() AT TIME ZONE 'UTC')::date THEN 1 ELSE daily_checks_used + 1 END,
         daily_checks_date = (now() AT TIME ZONE 'UTC')::date
     WHERE id = $1`,
    [userId],
  );
}

/**
 * Called right after a successful checkout — switches the account's active
 * tariff immediately and gives it a fresh daily quota, per the "a new
 * purchase resets usage, doesn't inherit whatever was used under the old
 * tariff today" product decision (premium_until itself is NOT reset here —
 * see extendPremiumUntil below — only the daily counter is).
 */
export async function setCurrentTariffAndResetUsage(userId: string, tariffId: string): Promise<void> {
  await pool.query(`UPDATE users SET current_tariff_id = $2, daily_checks_used = 0, daily_checks_date = NULL, updated_at = now() WHERE id = $1`, [
    userId,
    tariffId,
  ]);
}

/** Admin-triggered manual reset (UsersSection's "Сбросить попытки" button) — for support cases where waiting for the UTC-midnight rollover isn't practical. */
export async function resetDailyChecksUsed(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET daily_checks_used = 0, daily_checks_date = NULL, updated_at = now() WHERE id = $1`, [userId]);
}

export function isPremiumActive(premiumUntil: Date | null): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}

type PremiumPlan = 'monthly' | 'yearly';

const PLAN_INTERVALS: Record<PremiumPlan, string> = { monthly: '1 month', yearly: '1 year' };

/**
 * Extends premium from whichever is later — the current expiry or now — so a
 * renewal while still within an active period stacks onto it instead of
 * resetting the clock to "now + one period" (which would shave off whatever
 * time was left).
 */
export async function extendPremiumUntil(userId: string, plan: PremiumPlan): Promise<void> {
  await pool.query(
    `UPDATE users SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + $2::interval, updated_at = now() WHERE id = $1`,
    [userId, PLAN_INTERVALS[plan]],
  );
}
