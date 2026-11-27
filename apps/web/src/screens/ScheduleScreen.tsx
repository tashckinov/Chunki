import { useAppStore } from '../store/appStore';
import { useScheduleView } from '../store/derived';
import { Slider } from '../components/ui/Slider';
import { StudyReminderSetting } from '../components/ui/StudyReminderSetting';

export function ScheduleScreen() {
  const { to, minutes, setMinutes, finishSchedule, days, setStudyDays } = useAppStore();
  const { scheduleSummary } = useScheduleView();

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8">
      <div>
        <div className="text-page-title">Сколько готовы заниматься</div>
        <div className="text-body-secondary mt-2">От этого зависит, за сколько недель закроется программа до {to}.</div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-section-title">Минут за занятие</div>
          <div className="text-[19px] font-medium">{minutes}</div>
        </div>
        <Slider value={minutes} min={10} max={60} step={5} onChange={setMinutes} />
      </div>

      <div className="text-body-secondary border-t border-border pt-6">{scheduleSummary}</div>
      <StudyReminderSetting studyDays={days} onStudyDaysChange={setStudyDays} finishSchedule={finishSchedule} />
    </div>
  );
}
