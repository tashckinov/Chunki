import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

export type Periodicity = 'monthly' | 'yearly';

export interface TariffRow {
  id: string;
  name: string;
  periodicity: Periodicity;
  offer_url: string | null;
  price_usd: string | null;
  price_eur: string | null;
  price_rub: string | null;
  allow_cards: boolean;
  allow_program: boolean;
  daily_check_limit: number | null;
  is_default: boolean;
  position: number;
  created_at: Date;
  updated_at: Date;
}

const TARIFF_COLUMNS =
  'id, name, periodicity, offer_url, price_usd, price_eur, price_rub, allow_cards, allow_program, daily_check_limit, is_default, position, created_at, updated_at';

export async function listTariffs(): Promise<TariffRow[]> {
  const { rows } = await pool.query<TariffRow>(`SELECT ${TARIFF_COLUMNS} FROM subscription_tariffs ORDER BY position, created_at`);
  return rows;
}

export async function findTariffById(id: string): Promise<TariffRow | null> {
  const { rows } = await pool.query<TariffRow>(`SELECT ${TARIFF_COLUMNS} FROM subscription_tariffs WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findDefaultTariff(): Promise<TariffRow | null> {
  const { rows } = await pool.query<TariffRow>(`SELECT ${TARIFF_COLUMNS} FROM subscription_tariffs WHERE is_default = true ORDER BY position LIMIT 1`);
  return rows[0] ?? null;
}

export interface TariffInput {
  name: string;
  periodicity: Periodicity;
  offerUrl: string | null;
  priceUsd: number | null;
  priceEur: number | null;
  priceRub: number | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
  isDefault: boolean;
  position: number;
}

/** Only one tariff may be the default at a time — clearing every other row's flag in the same transaction as the write keeps that true regardless of which row is being touched. */
async function clearOtherDefaults(client: PoolClient, exceptId: string): Promise<void> {
  await client.query(`UPDATE subscription_tariffs SET is_default = false WHERE id != $1 AND is_default = true`, [exceptId]);
}

export async function createTariff(input: TariffInput): Promise<TariffRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<TariffRow>(
      `INSERT INTO subscription_tariffs (name, periodicity, offer_url, price_usd, price_eur, price_rub, allow_cards, allow_program, daily_check_limit, is_default, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING ${TARIFF_COLUMNS}`,
      [
        input.name,
        input.periodicity,
        input.offerUrl,
        input.priceUsd,
        input.priceEur,
        input.priceRub,
        input.allowCards,
        input.allowProgram,
        input.dailyCheckLimit,
        input.isDefault,
        input.position,
      ],
    );
    const row = rows[0];
    if (input.isDefault) await clearOtherDefaults(client, row.id);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTariff(id: string, input: TariffInput): Promise<TariffRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<TariffRow>(
      `UPDATE subscription_tariffs
       SET name=$2, periodicity=$3, offer_url=$4, price_usd=$5, price_eur=$6, price_rub=$7,
           allow_cards=$8, allow_program=$9, daily_check_limit=$10, is_default=$11, position=$12, updated_at=now()
       WHERE id = $1
       RETURNING ${TARIFF_COLUMNS}`,
      [
        id,
        input.name,
        input.periodicity,
        input.offerUrl,
        input.priceUsd,
        input.priceEur,
        input.priceRub,
        input.allowCards,
        input.allowProgram,
        input.dailyCheckLimit,
        input.isDefault,
        input.position,
      ],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (input.isDefault) await clearOtherDefaults(client, id);
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** ON DELETE CASCADE on subscription_tariff_upsells and ON DELETE SET NULL on users.current_tariff_id (see 0018 migration) mean this alone cleans up every reference — a deleted tariff's former holders just fall back to whatever's is_default at their next entitlement check. */
export async function deleteTariff(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM subscription_tariffs WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listUpsellIds(tariffId: string): Promise<string[]> {
  const { rows } = await pool.query<{ upsell_tariff_id: string }>(
    `SELECT upsell_tariff_id FROM subscription_tariff_upsells WHERE tariff_id = $1 ORDER BY position`,
    [tariffId],
  );
  return rows.map((r) => r.upsell_tariff_id);
}

export async function listUpsellIdsForTariffs(tariffIds: string[]): Promise<Map<string, string[]>> {
  if (tariffIds.length === 0) return new Map();
  const { rows } = await pool.query<{ tariff_id: string; upsell_tariff_id: string }>(
    `SELECT tariff_id, upsell_tariff_id FROM subscription_tariff_upsells WHERE tariff_id = ANY($1::uuid[]) ORDER BY tariff_id, position`,
    [tariffIds],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.tariff_id) ?? [];
    arr.push(r.upsell_tariff_id);
    map.set(r.tariff_id, arr);
  }
  return map;
}

/** Full-replace, delete-then-reinsert-in-order — same pattern admin/repository.ts uses for other ordered child rows (situation prompts, sentences). */
export async function replaceUpsells(tariffId: string, upsellTariffIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM subscription_tariff_upsells WHERE tariff_id = $1`, [tariffId]);
    for (let i = 0; i < upsellTariffIds.length; i++) {
      await client.query(`INSERT INTO subscription_tariff_upsells (tariff_id, upsell_tariff_id, position) VALUES ($1,$2,$3)`, [
        tariffId,
        upsellTariffIds[i],
        i,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
