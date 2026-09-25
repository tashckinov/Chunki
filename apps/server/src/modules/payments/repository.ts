import { pool } from '../../db/pool.js';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type PaymentPlan = 'monthly' | 'yearly';

export interface PaymentRow {
  id: string;
  user_id: string | null;
  provider: string;
  external_id: string;
  plan: string;
  status: string;
  amount: string | null;
  currency: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewPendingPayment {
  userId: string;
  provider: string;
  externalId: string;
  plan: PaymentPlan;
}

export async function createPendingPayment(input: NewPendingPayment): Promise<PaymentRow> {
  const { rows } = await pool.query<PaymentRow>(
    `INSERT INTO payments (user_id, provider, external_id, plan, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id, user_id, provider, external_id, plan, status, amount, currency, created_at, updated_at`,
    [input.userId, input.provider, input.externalId, input.plan],
  );
  return rows[0];
}

export async function findPaymentByExternalId(provider: string, externalId: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(
    `SELECT id, user_id, provider, external_id, plan, status, amount, currency, created_at, updated_at
     FROM payments WHERE provider = $1 AND external_id = $2`,
    [provider, externalId],
  );
  return rows[0] ?? null;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<PaymentRow> {
  const { rows } = await pool.query<PaymentRow>(
    `UPDATE payments SET status = $2, updated_at = now() WHERE id = $1
     RETURNING id, user_id, provider, external_id, plan, status, amount, currency, created_at, updated_at`,
    [id, status],
  );
  return rows[0];
}

export interface WebhookLogInput {
  provider: string;
  eventType: string | null;
  payload: unknown;
  error: string | null;
}

/** An audit trail for every webhook delivery, successfully handled or not — mirrors aiLogs/repository.ts's recordAiCallLog. */
export async function recordWebhookLog(input: WebhookLogInput): Promise<void> {
  await pool.query(`INSERT INTO payment_webhook_logs (provider, event_type, payload, error) VALUES ($1, $2, $3, $4)`, [
    input.provider,
    input.eventType,
    JSON.stringify(input.payload),
    input.error,
  ]);
}

export interface PaymentWithUserRow extends PaymentRow {
  user_email: string | null;
}

export async function listPaymentsForAdmin(limit: number): Promise<PaymentWithUserRow[]> {
  const { rows } = await pool.query<PaymentWithUserRow>(
    `SELECT p.id, p.user_id, p.provider, p.external_id, p.plan, p.status, p.amount, p.currency, p.created_at, p.updated_at,
            u.email AS user_email
     FROM payments p
     LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

const PAYMENT_PLAN_COLUMNS = 'plan, title, offer_url, price_usd, price_eur, price_rub, updated_at';

export interface PaymentPlanRow {
  plan: string;
  title: string;
  offer_url: string | null;
  price_usd: string | null;
  price_eur: string | null;
  price_rub: string | null;
  updated_at: Date;
}

export async function listPaymentPlans(): Promise<PaymentPlanRow[]> {
  const { rows } = await pool.query<PaymentPlanRow>(`SELECT ${PAYMENT_PLAN_COLUMNS} FROM payment_plans ORDER BY plan`);
  return rows;
}

export async function findPaymentPlan(plan: PaymentPlan): Promise<PaymentPlanRow | null> {
  const { rows } = await pool.query<PaymentPlanRow>(`SELECT ${PAYMENT_PLAN_COLUMNS} FROM payment_plans WHERE plan = $1`, [plan]);
  return rows[0] ?? null;
}

export interface UpsertPaymentPlanInput {
  plan: PaymentPlan;
  title: string;
  offerUrl: string | null;
  priceUsd: number | null;
  priceEur: number | null;
  priceRub: number | null;
}

// payment_plans is seeded (0017_payment_plans.sql) with exactly the two rows
// this app's plan enum allows, so this is always an UPDATE in practice — the
// upsert form just makes the seed a non-requirement rather than depending on
// migrations never being skipped.
export async function upsertPaymentPlan(input: UpsertPaymentPlanInput): Promise<PaymentPlanRow> {
  const { rows } = await pool.query<PaymentPlanRow>(
    `INSERT INTO payment_plans (plan, title, offer_url, price_usd, price_eur, price_rub, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (plan) DO UPDATE SET title = $2, offer_url = $3, price_usd = $4, price_eur = $5, price_rub = $6, updated_at = now()
     RETURNING ${PAYMENT_PLAN_COLUMNS}`,
    [input.plan, input.title, input.offerUrl, input.priceUsd, input.priceEur, input.priceRub],
  );
  return rows[0];
}
