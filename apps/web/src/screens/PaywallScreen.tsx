import { Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';

const PLAN_COMPARE = [
  { label: 'Карточки с чанками', free: true },
  { label: 'Проверка уровня раз в месяц', free: true },
  { label: 'Все 14 тем и упражнения', free: false },
  { label: 'Проверка открытых ответов и письма', free: false },
  { label: 'Доп. уроки по слабым темам', free: false },
];

const PLANS = {
  monthly: { title: 'Месяц', meta: 'без обязательств', price: '590 ₽' },
  yearly: { title: 'Год', meta: 'выгоднее на 44%', price: '3 990 ₽' },
};

export function PaywallScreen() {
  const { to, plan, choosePlan, subscribe, skipPaywall } = useAppStore();
  const { scheduleSummary } = useScheduleView();
  const chosen = PLANS[plan];
  const chosenPrice = plan === 'yearly' ? '3 990 ₽ в год' : '590 ₽ в месяц';

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div>
        <div className="text-meta">План готов</div>
        <div className="text-page-title mt-1">14 тем до {to}</div>
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
        <Button size="lg" onClick={subscribe} className="w-full">
          Попробовать 7 дней бесплатно
        </Button>
        <Button variant="ghost" size="sm" onClick={skipPaywall} className="w-full">
          Продолжить бесплатно
        </Button>
        <div className="text-meta text-center">Первые 7 дней бесплатно, потом {chosenPrice}. Отмена в любой момент.</div>
      </div>
    </div>
  );
}
