import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCheckout, PLANS, CURRENCIES, type Plan, type Currency } from '../lib/payments';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Input } from '../components/ui/Input';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div>
        <div className="text-meta">{PLANS[plan].title}</div>
        <div className="text-page-title mt-1">Оплата</div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[14px] font-medium">Валюта</div>
        <SegmentedControl
          options={[
            { value: 'USD' as const, label: CURRENCIES.USD.symbol + ' USD' },
            { value: 'EUR' as const, label: CURRENCIES.EUR.symbol + ' EUR' },
            { value: 'RUB' as const, label: CURRENCIES.RUB.symbol + ' RUB' },
          ]}
          value={currency}
          onChange={setCurrency}
        />
        <div className="text-meta">Точную сумму покажет страница оплаты Lava.top на следующем шаге.</div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[14px] font-medium">Email</div>
        <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        <div className="text-meta">На этот адрес придёт чек об оплате. Можно указать другой, не только тот, что привязан к аккаунту.</div>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        {checkoutError && <div className="text-negative text-[13.5px] text-center">{checkoutError}</div>}
        <Button size="lg" onClick={() => subscribe(plan, currency, email.trim())} disabled={checkingOut || !emailValid} className="w-full">
          {checkingOut ? 'Переходим к оплате…' : 'Оплатить'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPlan(null)} className="w-full" disabled={checkingOut}>
          Назад
        </Button>
      </div>
    </div>
  );
}
