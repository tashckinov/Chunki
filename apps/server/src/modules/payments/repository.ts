import { pool } from '../../db/pool.js';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type PaymentPlan = 'monthly' | 'yearly';

export interface PaymentRow {
  id: string;
  user_id: string | null;
  provider: string;
  external_id: string;
  plan: string;
  tariff_id: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
  created_at: Date;
  updated_at: Date;
}

const PAYMENT_COLUMNS = 'id, user_id, provider, external_id, plan, tariff_id, status, amount, currency, created_at, updated_at';

export interface NewPendingPayment {
  userId: string;
  provider: string;
  externalId: string;
  plan: PaymentPlan;
  tariffId: string;
}

export async function createPendingPayment(input: NewPendingPayment): Promise<PaymentRow> {
  const { rows } = await pool.query<PaymentRow>(
    `INSERT INTO payments (user_id, provider, external_id, plan, tariff_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING ${PAYMENT_COLUMNS}`,
    [input.userId, input.provider, input.externalId, input.plan, input.tariffId],
  );
  return rows[0];
}

export async function findPaymentByExternalId(provider: string, externalId: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE provider = $1 AND external_id = $2`, [
    provider,
    externalId,
  ]);
  return rows[0] ?? null;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<PaymentRow> {
  const { rows } = await pool.query<PaymentRow>(`UPDATE payments SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${PAYMENT_COLUMNS}`, [
    id,
    status,
  ]);
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
    `SELECT p.id, p.user_id, p.provider, p.external_id, p.plan, p.tariff_id, p.status, p.amount, p.currency, p.created_at, p.updated_at,
            u.email AS user_email
     FROM payments p
     LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
