import { Icon } from '../components/ui/Icon';
import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';

const PLAN_COMPARE = [
  { label: 'Карточки с чанками', free: 'БЕСПЛАТНО', icon: 'Check' as const, fg: 'var(--md-primary)' },
  { label: 'Проверка уровня раз в месяц', free: 'БЕСПЛАТНО', icon: 'Check' as const, fg: 'var(--md-primary)' },
  { label: 'Все 14 тем и упражнения', free: 'В ПОДПИСКЕ', icon: 'Stars' as const, fg: 'var(--md-tertiary)' },
  { label: 'Проверка открытых ответов и письма', free: 'В ПОДПИСКЕ', icon: 'Stars' as const, fg: 'var(--md-tertiary)' },
  { label: 'Доп. уроки по слабым темам', free: 'В ПОДПИСКЕ', icon: 'Stars' as const, fg: 'var(--md-tertiary)' },
];

const PLANS = [
  { key: 'monthly' as const, title: 'Месяц', meta: 'без обязательств', price: '590 ₽' },
  { key: 'yearly' as const, title: 'Год', meta: 'выгоднее на 44%', price: '3 990 ₽' },
];

export function PaywallScreen() {
  const { to, plan, choosePlan, subscribe, skipPaywall } = useAppStore();
  const { scheduleSummary } = useScheduleView();
  const chosenPrice = plan === 'yearly' ? '3 990 ₽ в год' : '590 ₽ в месяц';

  return (
    <div className="scroll-clean flex-1 min-h-0 px-6 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <div>
        <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">ПЛАН ГОТОВ</div>
        <div className="text-[32px] leading-10 mt-2">14 тем до {to}</div>
        <div className="text-[15px] leading-[22px] tracking-[0.25px] text-on-surface-variant mt-2">{scheduleSummary}</div>
      </div>

      <div className="flex flex-col gap-3">
        {PLAN_COMPARE.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-[15px] leading-[22px]">
            <div className="w-[100px] flex-none text-[13px] tracking-[0.4px] text-on-surface-variant">{row.free}</div>
            <div className="flex-1">{row.label}</div>
            <div className="flex-none" style={{ color: row.fg }}>
              <Icon name={row.icon} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {PLANS.map((p) => {
          const on = plan === p.key;
          return (
            <div
              key={p.key}
              onClick={() => choosePlan(p.key)}
              className="cursor-pointer px-5 py-[18px] rounded-2xl flex items-center gap-3.5"
              style={{
                border: `2px solid ${on ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`,
                background: on ? 'var(--md-primary-container)' : 'transparent',
              }}
            >
              <div className="flex-1">
                <div className="text-[17px] leading-6">{p.title}</div>
                <div className="text-[13px] leading-[18px] tracking-[0.25px] text-on-surface-variant mt-0.5">{p.meta}</div>
              </div>
              <div className="text-xl font-medium" style={{ color: on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)' }}>
                {p.price}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="filled" size="m" onClick={subscribe} className="w-full h-14">
          Попробовать 7 дней бесплатно
        </Button>
        <Button variant="text" size="s" onClick={skipPaywall} className="w-full">
          Продолжить бесплатно
        </Button>
        <div className="text-xs leading-[18px] tracking-[0.4px] text-on-surface-variant text-center">
          Первые 7 дней бесплатно, потом {chosenPrice}. Отмена в любой момент.
        </div>
      </div>
    </div>
  );
}
