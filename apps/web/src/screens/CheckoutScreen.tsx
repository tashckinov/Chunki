import { useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCheckout, PLANS, CURRENCIES, type Plan, type Currency } from '../lib/payments';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/brand/Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function TopBar({ planBadge, onBadgeClick }: { planBadge?: Plan; onBadgeClick?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold">Chunki</span>
      </div>
      {planBadge && (
        <button
          type="button"
          onClick={onBadgeClick}
          className="pressable flex items-center gap-1 rounded-full bg-surface-subtle pl-3 pr-2 py-1.5 text-[13px] font-medium"
        >
          {PLANS[planBadge].title}
          <ChevronRight size={14} className="text-text-tertiary" />
        </button>
      )}
    </div>
  );
}

function PlanCard({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="px-5 py-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-[16px] font-medium">{PLANS[plan].title}</div>
        <div className="text-meta mt-0.5">{PLANS[plan].meta}</div>
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

/** Checkout flow: pick a plan card, then on one page pick currency, type an email, and hit "Оплатить" — nothing is picked automatically, unlike the old flow that took the plan/email from the store/account silently. */
export function CheckoutScreen() {
  const { user, back } = useAppStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [email, setEmail] = useState(user?.email ?? '');
  const { checkingOut, checkoutError, subscribe } = useCheckout();

  const emailValid = EMAIL_RE.test(email.trim());

  if (!plan) {
    return (
      <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
        <TopBar />
        <div className="text-page-title">Выберите подписку</div>
        <div className="flex flex-col gap-3">
          <PlanCard plan="monthly" onClick={() => setPlan('monthly')} />
          <PlanCard plan="yearly" onClick={() => setPlan('yearly')} />
        </div>
        <Button variant="ghost" size="sm" onClick={back} className="w-full mt-auto">
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <TopBar planBadge={plan} onBadgeClick={() => setPlan(null)} />

      <div className="rounded-[var(--radius-lg)] bg-surface-subtle overflow-hidden">
        <SummaryRow label="Подписка" onClick={() => setPlan(null)}>
          {PLANS[plan].title} · {PLANS[plan].meta}
        </SummaryRow>
        <SummaryRow label="Валюта">
          <SegmentedControl
            options={[
              { value: 'USD' as const, label: CURRENCIES.USD.symbol + ' USD' },
              { value: 'EUR' as const, label: CURRENCIES.EUR.symbol + ' EUR' },
              { value: 'RUB' as const, label: CURRENCIES.RUB.symbol + ' RUB' },
            ]}
            value={currency}
            onChange={setCurrency}
          />
        </SummaryRow>
        <SummaryRow label="Email">
          <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        </SummaryRow>
      </div>

      <div className="text-meta">
        Точную сумму покажет страница оплаты Lava.top на следующем шаге. На email придёт чек — можно указать другой, не
        только тот, что привязан к аккаунту.
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
