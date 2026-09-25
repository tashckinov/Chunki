import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import {
  fetchAdminPayments,
  fetchAdminPaymentPlans,
  saveAdminPaymentPlan,
  type AdminPayment,
  type AdminPaymentPlan,
  type PaymentPlanInput,
} from '../../lib/admin';

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  paid: { label: 'Оплачено', className: 'text-positive' },
  pending: { label: 'Ожидает', className: 'text-text-secondary' },
  failed: { label: 'Не удалось', className: 'text-negative' },
  cancelled: { label: 'Отменено', className: 'text-text-secondary' },
};

const PLAN_LABEL: Record<string, string> = { monthly: 'Месяц', yearly: 'Год' };

function toNumberOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Editable form for one plan — title, Lava.top offer link (bare offerId or the full "copy link", either works), and display price per currency. */
function PlanEditor({ plan, onSaved }: { plan: AdminPaymentPlan; onSaved: (updated: AdminPaymentPlan) => void }) {
  const [title, setTitle] = useState(plan.title);
  const [offerUrl, setOfferUrl] = useState(plan.offerUrl ?? '');
  const [priceUsd, setPriceUsd] = useState(plan.priceUsd ?? '');
  const [priceEur, setPriceEur] = useState(plan.priceEur ?? '');
  const [priceRub, setPriceRub] = useState(plan.priceRub ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const dirty =
    title !== plan.title ||
    offerUrl !== (plan.offerUrl ?? '') ||
    priceUsd !== (plan.priceUsd ?? '') ||
    priceEur !== (plan.priceEur ?? '') ||
    priceRub !== (plan.priceRub ?? '');

  async function save() {
    setSaving(true);
    setError(null);
    setSavedJustNow(false);
    const input: PaymentPlanInput = {
      title: title.trim(),
      offerUrl: offerUrl.trim() || null,
      priceUsd: toNumberOrNull(priceUsd),
      priceEur: toNumberOrNull(priceEur),
      priceRub: toNumberOrNull(priceRub),
    };
    try {
      const updated = await saveAdminPaymentPlan(plan.plan, input);
      onSaved(updated);
      setSavedJustNow(true);
    } catch {
      setError('Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-3">
      <div className="text-[15px] font-semibold">{PLAN_LABEL[plan.plan] ?? plan.plan}</div>

      <div>
        <div className="text-meta mb-1.5">Название</div>
        <Input value={title} onChange={setTitle} placeholder="Месяц" />
      </div>

      <div>
        <div className="text-meta mb-1.5">Ссылка на оффер Lava.top</div>
        <Input value={offerUrl} onChange={setOfferUrl} placeholder="https://app.lava.top/products/.../..." />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-meta mb-1.5">$ USD</div>
          <Input value={priceUsd} onChange={setPriceUsd} placeholder="6.99" type="number" />
        </div>
        <div>
          <div className="text-meta mb-1.5">€ EUR</div>
          <Input value={priceEur} onChange={setPriceEur} placeholder="5.99" type="number" />
        </div>
        <div>
          <div className="text-meta mb-1.5">₽ RUB</div>
          <Input value={priceRub} onChange={setPriceRub} placeholder="599" type="number" />
        </div>
      </div>

      {error && <div className="text-negative text-[13.5px]">{error}</div>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {!dirty && savedJustNow && <span className="text-positive text-[13px]">Сохранено ✓</span>}
      </div>
    </div>
  );
}

export function PaymentsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [plans, setPlans] = useState<AdminPaymentPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPaymentPlans()
      .then(setPlans)
      .catch(() => setPlansError('Не удалось загрузить настройки подписки.'));
    fetchAdminPayments()
      .then(setPayments)
      .catch(() => setError('Не удалось загрузить платежи.'));
  }, []);

  function handleSaved(updated: AdminPaymentPlan) {
    setPlans((prev) => (prev ? prev.map((p) => (p.plan === updated.plan ? updated : p)) : prev));
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Платежи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="text-[15px] font-semibold">Подписка</div>
          {plansError && <div className="text-negative">{plansError}</div>}
          {!plansError && !plans && <div className="text-body-secondary">Загрузка…</div>}
          {plans?.map((p) => <PlanEditor key={p.plan} plan={p} onSaved={handleSaved} />)}
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 border-t border-border">
          <div className="text-[15px] font-semibold">Платежи</div>
          {error && <div className="text-negative">{error}</div>}
          {!error && !payments && <div className="text-body-secondary">Загрузка…</div>}
          {!error && payments && (
            <>
              {payments.length === 0 && <div className="text-body-secondary">Пока нет ни одного платежа.</div>}
              {payments.map((p) => {
                const status = STATUS_COPY[p.status] ?? { label: p.status, className: '' };
                return (
                  <div key={p.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[14.5px] font-medium">{p.userEmail ?? '—'}</div>
                      <span className={`text-[12px] font-medium ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="text-[13.5px] text-text-secondary">
                      {PLAN_LABEL[p.plan] ?? p.plan}
                      {p.amount ? ` · ${p.amount} ${p.currency ?? ''}` : ''} · {p.provider}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-meta">
                      <span>{new Date(p.createdAt).toLocaleString('ru-RU')}</span>
                      <span className="truncate">{p.id}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
