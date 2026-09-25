import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCheckout, fetchPaymentPlans, PLAN_BLURB, CURRENCIES, type Plan, type Currency, type PaymentPlanInfo } from '../lib/payments';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/brand/Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TITLES: Record<Plan, string> = { monthly: 'Месяц', yearly: 'Год' };
const CURRENCY_PRICE_KEY: Record<Currency, 'priceUsd' | 'priceEur' | 'priceRub'> = { USD: 'priceUsd', EUR: 'priceEur', RUB: 'priceRub' };
const ALL_CURRENCIES: Currency[] = ['USD', 'EUR', 'RUB'];

function TopBar({ title, onBadgeClick }: { title?: string; onBadgeClick?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold">Chunki</span>
      </div>
      {title && (
        <button
          type="button"
          onClick={onBadgeClick}
          className="pressable flex items-center gap-1 rounded-full bg-surface-subtle pl-3 pr-2 py-1.5 text-[13px] font-medium"
        >
          {title}
          <ChevronRight size={14} className="text-text-tertiary" />
        </button>
      )}
    </div>
  );
}

function PlanCard({ plan, title, onClick }: { plan: Plan; title: string; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="px-5 py-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-[16px] font-medium">{title}</div>
        <div className="text-meta mt-0.5">{PLAN_BLURB[plan]}</div>
      </div>
      <Check size={18} className="text-text-tertiary" />
    </Card>
  );
}

function SummaryRow({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${onClick ? 'pressable text-left w-full flex items-center justify-between' : ''} px-4 py-3.5 border-b border-border last:border-b-0`}
    >
      <div className={onClick ? '' : 'flex flex-col gap-2'}>
        <div className="text-meta">{label}</div>
        {onClick ? <div className="text-[15px] font-medium mt-0.5">{children}</div> : children}
      </div>
      {onClick && <ChevronRight size={18} className="text-text-tertiary flex-none" />}
    </Comp>
  );
}

/** Checkout flow: pick a plan card, then on one page pick currency, type an email, and hit "Оплатить" — nothing is picked automatically, unlike the old flow that took the plan/email from the store/account silently. Title/prices come from the admin-managed payment_plans config (see admin "Платежи"), not a hardcoded guess. */
export function CheckoutScreen() {
  const { user, back } = useAppStore();
  const [plans, setPlans] = useState<PaymentPlanInfo[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [email, setEmail] = useState(user?.email ?? '');
  const { checkingOut, checkoutError, subscribe } = useCheckout();

  useEffect(() => {
    fetchPaymentPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  const planInfo = plans?.find((p) => p.plan === plan) ?? null;
  const title = plan ? (planInfo?.title ?? DEFAULT_TITLES[plan]) : '';

  // Only offer a currency the admin actually priced this plan in — falls
  // back to all three while plans haven't loaded yet or none are priced,
  // so checkout never gets blocked before prices are filled in.
  const availableCurrencies = useMemo<Currency[]>(() => {
    if (!planInfo) return ALL_CURRENCIES;
    const priced = ALL_CURRENCIES.filter((c) => planInfo[CURRENCY_PRICE_KEY[c]]);
    return priced.length > 0 ? priced : ALL_CURRENCIES;
  }, [planInfo]);

  useEffect(() => {
    if (!availableCurrencies.includes(currency)) setCurrency(availableCurrencies[0]);
  }, [availableCurrencies, currency]);

  const emailValid = EMAIL_RE.test(email.trim());
  const price = planInfo?.[CURRENCY_PRICE_KEY[currency]] ?? null;

  if (!plan) {
    return (
      <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
        <TopBar />
        <div className="text-page-title">Выберите подписку</div>
        <div className="flex flex-col gap-3">
          <PlanCard plan="monthly" title={plans?.find((p) => p.plan === 'monthly')?.title ?? DEFAULT_TITLES.monthly} onClick={() => setPlan('monthly')} />
          <PlanCard plan="yearly" title={plans?.find((p) => p.plan === 'yearly')?.title ?? DEFAULT_TITLES.yearly} onClick={() => setPlan('yearly')} />
        </div>
        <Button variant="ghost" size="sm" onClick={back} className="w-full mt-auto">
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <TopBar title={title} onBadgeClick={() => setPlan(null)} />

      <div className="rounded-[var(--radius-lg)] bg-surface-subtle overflow-hidden">
        <SummaryRow label="Подписка" onClick={() => setPlan(null)}>
          {title} · {PLAN_BLURB[plan]}
        </SummaryRow>
        <SummaryRow label="Валюта">
          <SegmentedControl
            options={availableCurrencies.map((c) => ({ value: c, label: `${CURRENCIES[c].symbol} ${c}` }))}
            value={currency}
            onChange={setCurrency}
          />
        </SummaryRow>
        <SummaryRow label="Email">
          <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        </SummaryRow>
      </div>

      <div className="text-meta">
        {price
          ? `Цена: ${CURRENCIES[currency].symbol}${price} ${currency}.`
          : 'Точную сумму покажет страница оплаты Lava.top на следующем шаге.'}{' '}
        На email придёт чек — можно указать другой, не только тот, что привязан к аккаунту.
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        {checkoutError && <div className="text-negative text-[13.5px] text-center">{checkoutError}</div>}
        <Button size="lg" onClick={() => subscribe(plan, currency, email.trim())} disabled={checkingOut || !emailValid} className="w-full">
          {checkingOut ? 'Переходим к оплате…' : 'Оплатить'}
        </Button>
      </div>
    </div>
  );
}
