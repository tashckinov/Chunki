import { extractOfferId } from '../payments/offerId.js';
import { findAccountStatus, isPremiumActive } from '../users/repository.js';
import {
  listTariffs as repoListTariffs,
  findTariffById as repoFindTariffById,
  findDefaultTariff as repoFindDefaultTariff,
  createTariff as repoCreateTariff,
  updateTariff as repoUpdateTariff,
  deleteTariff as repoDeleteTariff,
  listUpsellIds as repoListUpsellIds,
  listUpsellIdsForTariffs as repoListUpsellIdsForTariffs,
  replaceUpsells as repoReplaceUpsells,
  type TariffRow,
  type TariffInput,
  type Periodicity,
} from './repository.js';

export interface PublicTariff {
  id: string;
  name: string;
  periodicity: Periodicity;
  priceUsd: string | null;
  priceEur: string | null;
  priceRub: string | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
}

function toPublicTariff(row: TariffRow): PublicTariff {
  return {
    id: row.id,
    name: row.name,
    periodicity: row.periodicity,
    priceUsd: row.price_usd,
    priceEur: row.price_eur,
    priceRub: row.price_rub,
    allowCards: row.allow_cards,
    allowProgram: row.allow_program,
    dailyCheckLimit: row.daily_check_limit,
  };
}

/** Public — no offerUrl (nothing client-side needs it; checkout only ever sends a tariffId, the server looks the offer link up itself), no auth required. */
export async function listPublicTariffs(): Promise<PublicTariff[]> {
  return (await repoListTariffs()).map(toPublicTariff);
}

export interface AdminTariff extends PublicTariff {
  offerUrl: string | null;
  isDefault: boolean;
  position: number;
  upsellTariffIds: string[];
  updatedAt: string;
}

export async function listTariffsForAdmin(): Promise<AdminTariff[]> {
  const rows = await repoListTariffs();
  const upsellsByTariff = await repoListUpsellIdsForTariffs(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...toPublicTariff(row),
    offerUrl: row.offer_url,
    isDefault: row.is_default,
    position: row.position,
    upsellTariffIds: upsellsByTariff.get(row.id) ?? [],
    updatedAt: row.updated_at.toISOString(),
  }));
}

export interface UpsertTariffInput {
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
  upsellTariffIds: string[];
}

async function toAdminTariff(row: TariffRow): Promise<AdminTariff> {
  return {
    ...toPublicTariff(row),
    offerUrl: row.offer_url,
    isDefault: row.is_default,
    position: row.position,
    upsellTariffIds: await repoListUpsellIds(row.id),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toRepoInput(input: UpsertTariffInput): TariffInput {
  return {
    name: input.name,
    periodicity: input.periodicity,
    offerUrl: input.offerUrl,
    priceUsd: input.priceUsd,
    priceEur: input.priceEur,
    priceRub: input.priceRub,
    allowCards: input.allowCards,
    allowProgram: input.allowProgram,
    dailyCheckLimit: input.dailyCheckLimit,
    isDefault: input.isDefault,
    position: input.position,
  };
}

export async function createTariffForAdmin(input: UpsertTariffInput): Promise<AdminTariff> {
  const row = await repoCreateTariff(toRepoInput(input));
  // upsellTariffIds may reference a tariff that doesn't exist yet in the
  // same request in principle, but the FK on subscription_tariff_upsells
  // guards that — a bad id just fails the write with a clear DB error
  // rather than silently storing a dangling reference.
  await repoReplaceUpsells(row.id, input.upsellTariffIds.filter((id) => id !== row.id));
  return toAdminTariff(row);
}

export type UpdateTariffResult = { kind: 'ok'; tariff: AdminTariff } | { kind: 'not_found' };

export async function updateTariffForAdmin(id: string, input: UpsertTariffInput): Promise<UpdateTariffResult> {
  const row = await repoUpdateTariff(id, toRepoInput(input));
  if (!row) return { kind: 'not_found' };
  await repoReplaceUpsells(id, input.upsellTariffIds.filter((upsellId) => upsellId !== id));
  return { kind: 'ok', tariff: await toAdminTariff(row) };
}

export async function deleteTariffForAdmin(id: string): Promise<boolean> {
  return repoDeleteTariff(id);
}

// ---- entitlement resolution, used by progress/service.ts + program/service.ts ----

export interface EffectiveTariff {
  id: string | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
  /** true for an admin account or an unset default tariff — never gated on anything. */
  unrestricted: boolean;
}

const UNRESTRICTED: EffectiveTariff = { id: null, allowCards: true, allowProgram: true, dailyCheckLimit: null, unrestricted: true };

function toEffectiveTariff(row: TariffRow): EffectiveTariff {
  return { id: row.id, allowCards: row.allow_cards, allowProgram: row.allow_program, dailyCheckLimit: row.daily_check_limit, unrestricted: false };
}

/**
 * Admins bypass every gate unconditionally (same as before this feature —
 * see the old isFree check). Otherwise: a currently-paid account uses its
 * current_tariff_id; everyone else (never paid, or premium_until lapsed)
 * falls back to whichever tariff is_default. No is_default tariff
 * configured at all is a genuine misconfiguration — fail open (unrestricted)
 * rather than silently locking every free user out of the whole app.
 */
export async function resolveEffectiveTariff(userId: string): Promise<EffectiveTariff> {
  const account = await findAccountStatus(userId);
  if (!account) return UNRESTRICTED;
  if (account.isAdmin) return UNRESTRICTED;

  const tariffId = isPremiumActive(account.premiumUntil) && account.currentTariffId ? account.currentTariffId : null;
  const row = tariffId ? await repoFindTariffById(tariffId) : await repoFindDefaultTariff();
  if (!row) {
    const fallback = tariffId ? await repoFindDefaultTariff() : null;
    return fallback ? toEffectiveTariff(fallback) : UNRESTRICTED;
  }
  return toEffectiveTariff(row);
}

/** Today's effective daily-checks-used count, accounting for the UTC-date rollover (the stored count reads as 0 once its date no longer matches today). */
export function effectiveDailyChecksUsed(dailyChecksUsed: number, dailyChecksDate: string | null): number {
  const today = new Date().toISOString().slice(0, 10);
  return dailyChecksDate === today ? dailyChecksUsed : 0;
}

export async function listUpsellTariffs(tariffId: string | null): Promise<PublicTariff[]> {
  if (!tariffId) return [];
  const ids = await repoListUpsellIds(tariffId);
  if (ids.length === 0) return [];
  const all = await repoListTariffs();
  const byId = new Map(all.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is TariffRow => !!r).map(toPublicTariff);
}

/** For checkout: the offerId to send Lava.top, extracted from whatever the admin pasted (bare id or the full "copy link"). Null when the tariff has no offer link saved yet, or doesn't exist. */
export async function resolveOfferId(tariffId: string): Promise<{ tariff: TariffRow; offerId: string } | null> {
  const tariff = await repoFindTariffById(tariffId);
  if (!tariff) return null;
  const offerId = extractOfferId(tariff.offer_url);
  if (!offerId) return null;
  return { tariff, offerId };
}
