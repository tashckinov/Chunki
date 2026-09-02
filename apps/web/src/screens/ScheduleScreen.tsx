import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';
import { Slider } from '../components/ui/Slider';
import { Chip } from '../components/ui/Chip';

export function ScheduleScreen() {
  const { to, minutes, setMinutes, goPaywall } = useAppStore();
  const { dayPicks, timePicks, scheduleSummary } = useScheduleView();

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8">
      <div>
        <div className="text-page-title">Сколько готовы заниматься</div>
        <div className="text-body-secondary mt-2">От этого зависит, за сколько недель закроется программа до {to}.</div>
      </div>

      <div>
        <div className="text-section-title mb-3">Дни занятий</div>
        <div className="flex gap-2">
          {dayPicks.map((d) => (
            <button
              key={d.label}
              onClick={d.pick}
              className={`pressable flex-1 aspect-square rounded-full flex items-center justify-center text-[14px] font-medium transition-colors ${
                d.selected ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-text'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-section-title">Минут за занятие</div>
          <div className="text-[19px] font-medium">{minutes}</div>
        </div>
        <Slider value={minutes} min={10} max={60} step={5} onChange={setMinutes} />
      </div>

      <div>
        <div className="text-section-title mb-3">Время напоминания</div>
        <div className="flex gap-2 flex-wrap">
          {timePicks.map((tp) => (
            <Chip key={tp.label} selected={tp.selected} onClick={tp.pick}>
              {tp.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="text-body-secondary border-t border-border pt-6">{scheduleSummary}</div>
      <Button size="lg" onClick={goPaywall} className="w-full">
        Готово
      </Button>
    </div>
  );
}
