import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Button } from '../components/ui/Button';
import { Slider } from '../components/ui/Slider';

export function ScheduleScreen() {
  const { to, minutes, setMinutes, goPaywall } = useAppStore();
  const { dayPicks, timePicks, scheduleSummary } = useScheduleView();

  return (
    <div className="scroll-clean flex-1 min-h-0 px-6 pt-4 pb-8 flex flex-col gap-7">
      <div>
        <div className="text-[32px] leading-10">Сколько готовы заниматься</div>
        <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant mt-2">
          От этого зависит, за сколько недель закроется программа до {to}.
        </div>
      </div>

      <div>
        <div className="text-sm font-medium tracking-[0.1px] mb-3">Дни занятий</div>
        <div className="flex gap-2">
          {dayPicks.map((d) => (
            <div
              key={d.label}
              onClick={d.pick}
              className="cursor-pointer flex-1 aspect-square rounded-full flex items-center justify-center text-sm font-medium"
              style={{ border: `1px solid ${d.border}`, background: d.bg, color: d.fg }}
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-sm font-medium tracking-[0.1px]">Минут за занятие</div>
          <div className="text-[22px] leading-7">{minutes}</div>
        </div>
        <Slider value={minutes} min={10} max={60} step={5} onChange={setMinutes} />
      </div>

      <div>
        <div className="text-sm font-medium tracking-[0.1px] mb-3">Время напоминания</div>
        <div className="flex gap-2 flex-wrap">
          {timePicks.map((tp) => (
            <div
              key={tp.label}
              onClick={tp.pick}
              className="cursor-pointer px-[18px] py-2.5 rounded-full text-sm font-medium"
              style={{ border: `1px solid ${tp.border}`, background: tp.bg, color: tp.fg }}
            >
              {tp.label}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-secondary-container text-on-secondary-container text-[15px] leading-[22px] tracking-[0.25px]">
        {scheduleSummary}
      </div>
      <Button variant="filled" size="m" onClick={goPaywall} className="w-full h-14">
        Готово
      </Button>
    </div>
  );
}
