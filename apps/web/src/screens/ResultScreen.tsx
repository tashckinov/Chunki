import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/Button';

export function ResultScreen() {
  const { placementResult, gradingError, to, goSchedule, startTest } = useAppStore();

  if (!placementResult) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-lg">Не получилось проверить тест</div>
        <div className="text-sm text-on-surface-variant">{gradingError || 'Попробуйте ещё раз.'}</div>
        <Button variant="filled" size="s" onClick={startTest}>
          Пройти тест заново
        </Button>
      </div>
    );
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-6 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <div>
        <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">РЕЗУЛЬТАТ ТЕСТА</div>
        <div className="text-[57px] leading-[64px] tracking-[-0.25px] mt-2">{placementResult.overallLevel}</div>
        <div className="text-base leading-6 tracking-[0.5px] text-on-surface-variant">
          Цель: {to} · {placementResult.mcqScore.correct}/{placementResult.mcqScore.total} по грамматике
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {placementResult.skills.map((skill) => {
          const fg = skill.score >= 0.7 ? 'var(--md-primary)' : skill.score >= 0.5 ? 'var(--md-tertiary)' : 'var(--md-error)';
          return (
            <div key={skill.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <div className="flex-1 text-[15px] leading-5">{skill.label}</div>
                <div className="text-[13px] font-medium" style={{ color: fg }}>
                  {skill.tag}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div className="h-full rounded-full" style={{ background: fg, width: `${skill.score * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-xl bg-primary-container text-on-primary-container">
        <div className="text-sm font-medium tracking-[0.1px] mb-2">Уже выше уровня</div>
        <div className="text-sm leading-[22px] tracking-[0.25px]">{placementResult.aboveLevel}</div>
      </div>
      <div className="p-4 rounded-xl bg-error-container text-on-error-container">
        <div className="text-sm font-medium tracking-[0.1px] mb-2">Тянет уровень вниз</div>
        <div className="text-sm leading-[22px] tracking-[0.25px]">{placementResult.belowLevel}</div>
      </div>

      <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant">
        Программа собрана из этих слабых мест: 14 тем до {to}, первые четыре — грамматический фундамент.
      </div>
      <Button variant="filled" size="m" onClick={goSchedule} className="w-full h-14">
        Настроить расписание
      </Button>
    </div>
  );
}
