import { Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';

const PLAN_COMPARE = [
  { label: 'Карточки с чанками', free: true },
  { label: 'Проверка уровня раз в месяц', free: true },
  { label: 'Все темы и упражнения', free: false },
  { label: 'Проверка открытых ответов и письма', free: false },
  { label: 'Доп. уроки по слабым темам', free: false },
];

export function PaywallScreen() {
  const { to, skipPaywall, go } = useAppStore();
  const { scheduleSummary } = useScheduleView();

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

      <div className="flex flex-col gap-2 mt-auto">
        <Button size="lg" onClick={() => go('checkout')} className="w-full">
          Оформить подписку
        </Button>
        <Button variant="ghost" size="sm" onClick={skipPaywall} className="w-full">
          Продолжить бесплатно
        </Button>
        <div className="text-meta text-center">Отмена в любой момент.</div>
      </div>
    </div>
  );
}
