import { getPaymentProvider } from './index.js';
import {
  createPendingPayment,
  findPaymentByExternalId,
  updatePaymentStatus,
  recordWebhookLog,
  listPaymentsForAdmin as repoListPaymentsForAdmin,
  type PaymentPlan,
  type PaymentStatus,
} from './repository.js';
import { extendPremiumUntil, findAccountStatus, isPremiumActive } from '../users/repository.js';

export type CheckoutResult = { kind: 'ok'; paymentUrl: string } | { kind: 'no_email' };

export async function createCheckoutForUser(userId: string, email: string | null, plan: PaymentPlan): Promise<CheckoutResult> {
  if (!email) return { kind: 'no_email' };

  const provider = getPaymentProvider();
  const { externalId, paymentUrl, instantlyPaid } = await provider.createCheckout({ email, plan });
  const payment = await createPendingPayment({ userId, provider: provider.name, externalId, plan });

  // Mock provider only — lets the whole checkout flow be exercised in
  // dev/demo without real Lava.top credentials (see provider.ts).
  if (instantlyPaid) {
    await updatePaymentStatus(payment.id, 'paid');
    await extendPremiumUntil(userId, plan);
  }

  return { kind: 'ok', paymentUrl };
}

export async function getAccountPaymentStatus(userId: string): Promise<{ premiumUntil: string | null; isPremium: boolean }> {
  const account = await findAccountStatus(userId);
  const premiumUntil = account?.premiumUntil ?? null;
  return { premiumUntil: premiumUntil ? premiumUntil.toISOString() : null, isPremium: isPremiumActive(premiumUntil) };
}

const SUCCESS_EVENTS = new Set(['payment.success', 'subscription.recurring.payment.success']);
const FAILURE_EVENTS = new Set(['payment.failed', 'subscription.recurring.payment.failed']);
const CANCEL_EVENTS = new Set(['subscription.cancelled']);

/**
 * Field names below (eventType, contractId) are the best-effort reconstruction
 * documented in lavaTopClient.ts's header — this is the one other place that
 * depends on them, kept minimal on purpose so it's easy to adjust.
 */
export interface LavaTopWebhookPayload {
  eventType?: unknown;
  contractId?: unknown;
  [key: string]: unknown;
}

/**
 * Deliberately does not fall back to matching the payment by buyer email when
 * contractId doesn't match an existing row — silently crediting a guessed
 * account is a worse failure mode for a payments system than a visible miss.
 * An unmatched contractId is logged to payment_webhook_logs (visible in the
 * admin "Платежи" page) for manual reconciliation via the existing admin
 * premiumUntil override instead.
 */
export async function handleLavaTopWebhook(payload: LavaTopWebhookPayload): Promise<void> {
  const eventType = typeof payload.eventType === 'string' ? payload.eventType : null;
  const contractId = typeof payload.contractId === 'string' ? payload.contractId : null;

  try {
    if (!contractId) {
      await recordWebhookLog({ provider: 'lava_top', eventType, payload, error: 'webhook payload had no contractId' });
      return;
    }

    const payment = await findPaymentByExternalId('lava_top', contractId);
    if (!payment) {
      await recordWebhookLog({ provider: 'lava_top', eventType, payload, error: `no payment found for contractId ${contractId}` });
      return;
    }

    let status: PaymentStatus | null = null;
    if (eventType && SUCCESS_EVENTS.has(eventType)) status = 'paid';
    else if (eventType && FAILURE_EVENTS.has(eventType)) status = 'failed';
    else if (eventType && CANCEL_EVENTS.has(eventType)) status = 'cancelled';

    if (status) await updatePaymentStatus(payment.id, status);
    if (status === 'paid' && payment.user_id) await extendPremiumUntil(payment.user_id, payment.plan as PaymentPlan);

    await recordWebhookLog({
      provider: 'lava_top',
      eventType,
      payload,
      error: status ? null : `unrecognized eventType "${eventType ?? 'null'}" — payment status left unchanged`,
    });
  } catch (err) {
    await recordWebhookLog({ provider: 'lava_top', eventType, payload, error: err instanceof Error ? err.message : String(err) }).catch(() => {});
    throw err;
  }
}

export interface AdminPaymentSummary {
  id: string;
  userEmail: string | null;
  provider: string;
  plan: string;
  status: string;
  amount: string | null;
  currency: string | null;
  createdAt: string;
}

export async function listPaymentsForAdmin(limit: number): Promise<AdminPaymentSummary[]> {
  const rows = await repoListPaymentsForAdmin(limit);
  return rows.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    provider: r.provider,
    plan: r.plan,
    status: r.status,
    amount: r.amount,
    currency: r.currency,
    createdAt: r.created_at.toISOString(),
  }));
}
