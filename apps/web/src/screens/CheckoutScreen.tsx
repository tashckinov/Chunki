import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useCheckout, PLANS, CURRENCIES, type Plan, type Currency } from '../lib/payments';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Input } from '../components/ui/Input';

const STEPS = ['Подписка', 'Валюта', 'Email'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checkout stepper: plan → currency → email, then "Оплатить" — nothing is picked automatically, unlike the old flow that took the plan/email from the store/account silently. */
export function CheckoutScreen() {
  const { user, back } = useAppStore();
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Plan>('monthly');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [email, setEmail] = useState(user?.email ?? '');
  const { checkingOut, checkoutError, subscribe } = useCheckout();

  const emailValid = EMAIL_RE.test(email.trim());

  function goToStep(next: number) {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div>
        <div className="text-meta">
          Шаг {step + 1} из {STEPS.length}
        </div>
        <div className="text-page-title mt-1">{STEPS[step]}</div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            options={[
              { value: 'monthly' as const, label: PLANS.monthly.title },
              { value: 'yearly' as const, label: PLANS.yearly.title },
            ]}
            value={plan}
            onChange={setPlan}
          />
          <div className="rounded-[var(--radius-md)] bg-surface-subtle px-4 py-4">
            <div className="text-[16px] font-medium">{PLANS[plan].title}</div>
            <div className="text-meta mt-0.5">{PLANS[plan].meta}</div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            options={[
              { value: 'USD' as const, label: CURRENCIES.USD.symbol + ' USD' },
              { value: 'EUR' as const, label: CURRENCIES.EUR.symbol + ' EUR' },
            ]}
            value={currency}
            onChange={setCurrency}
          />
          <div className="text-meta">Точную сумму покажет страница оплаты Lava.top на следующем шаге.</div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <div className="text-meta">На этот адрес придёт чек об оплате. Можно указать другой, не только тот, что привязан к аккаунту.</div>
          {checkoutError && <div className="text-negative text-[13.5px]">{checkoutError}</div>}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={() => goToStep(step + 1)} className="w-full">
            Далее
          </Button>
        ) : (
          <Button size="lg" onClick={() => subscribe(plan, currency, email.trim())} disabled={checkingOut || !emailValid} className="w-full">
            {checkingOut ? 'Переходим к оплате…' : 'Оплатить'}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => (step === 0 ? back() : goToStep(step - 1))} className="w-full" disabled={checkingOut}>
          Назад
        </Button>
      </div>
    </div>
  );
}
