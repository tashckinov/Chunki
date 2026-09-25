import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { createCheckout } from '../lib/payments';
import { ApiError } from '../lib/collections';

const PLAN_COMPARE = [
  { label: 'Карточки с чанками', free: true },
  { label: 'Проверка уровня раз в месяц', free: true },
  { label: 'Все темы и упражнения', free: false },
  { label: 'Проверка открытых ответов и письма', free: false },
  { label: 'Доп. уроки по слабым темам', free: false },
];

// The real price lives in Lava.top's dashboard (LAVA_TOP_OFFER_ID_MONTHLY/
// YEARLY — see apps/server/README.md's "Payments (Lava.top)" section) —
// this backend has no API to read it back, so these are a plain copy for
// display only. If the price changes in the dashboard, update it here too;
// nothing enforces they stay in sync.
const PLANS = {
  monthly: { title: 'Месяц', meta: 'без обязательств', price: '590 ₽' },
  yearly: { title: 'Год', meta: 'выгоднее на 44%', price: '3 990 ₽' },
};

export function PaywallScreen() {
  const { to, plan, choosePlan, skipPaywall } = useAppStore();
  const { scheduleSummary } = useScheduleView();
  const chosen = PLANS[plan];
  const chosenPrice = plan === 'yearly' ? '3 990 ₽ в год' : '590 ₽ в месяц';
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleSubscribe() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const { paymentUrl } = await createCheckout(plan);
      window.location.href = paymentUrl;
    } catch (err) {
      setCheckoutError(err instanceof ApiError && err.status === 409 ? 'К аккаунту не привязан email — войдите заново через Google.' : 'Не удалось начать оплату. Попробуйте позже.');
      setCheckingOut(false);
    }
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div>
        <div className="text-meta">План готов</div>
        <div className="text-page-title mt-1">Персональный план до {to}</div>
        <div className="text-body-secondary mt-2">{scheduleSummary}</div>
      </div>

      <div className="flex flex-col">
        {PLAN_COMPARE.map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
            <span className={row.free ? 'text-positive' : 'text-accent'}>{row.free ? <Check size={18} /> : <Sparkles size={18} />}</span>
            <div className="flex-1 text-[15px]">{row.label}</div>
            <div className="text-meta">{row.free ? 'бесплатно' : 'в подписке'}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <SegmentedControl
          options={[
            { value: 'monthly' as const, label: 'Месяц' },
            { value: 'yearly' as const, label: 'Год' },
          ]}
          value={plan}
          onChange={choosePlan}
        />
        <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-subtle px-4 py-4">
          <div>
            <div className="text-[16px] font-medium">{chosen.title}</div>
            <div className="text-meta mt-0.5">{chosen.meta}</div>
          </div>
          <div className="text-[20px] font-semibold">{chosen.price}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        {checkoutError && <div className="text-negative text-[13.5px] text-center">{checkoutError}</div>}
        <Button size="lg" onClick={handleSubscribe} disabled={checkingOut} className="w-full">
          {checkingOut ? 'Переходим к оплате…' : 'Оформить подписку'}
        </Button>
        <Button variant="ghost" size="sm" onClick={skipPaywall} className="w-full" disabled={checkingOut}>
          Продолжить бесплатно
        </Button>
        <div className="text-meta text-center">{chosenPrice}. Отмена в любой момент.</div>
      </div>
    </div>
  );
}
