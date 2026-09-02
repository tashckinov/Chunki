import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/Button';

export function ResultScreen() {
  const { placementResult, gradingError, to, goSchedule, startTest } = useAppStore();

  if (!placementResult) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Не получилось проверить тест</div>
        <div className="text-body-secondary">{gradingError || 'Попробуйте ещё раз.'}</div>
        <Button size="sm" onClick={startTest}>
          Пройти тест заново
        </Button>
      </div>
    );
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-2 pb-8 flex flex-col gap-8 anim-rise">
      <div>
        <div className="text-meta">Результат теста</div>
        <div className="text-[56px] leading-[60px] font-semibold tracking-tight mt-1">{placementResult.overallLevel}</div>
        <div className="text-body-secondary mt-1">
          Цель: {to} · {placementResult.mcqScore.correct}/{placementResult.mcqScore.total} по грамматике
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {placementResult.skills.map((skill) => {
          const fg = skill.score >= 0.7 ? 'var(--color-positive)' : skill.score >= 0.5 ? 'var(--color-warning)' : 'var(--color-negative)';
          return (
            <div key={skill.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <div className="flex-1 text-[15px]">{skill.label}</div>
                <div className="text-[13px] font-medium" style={{ color: fg }}>
                  {skill.tag}
                </div>
              </div>
              <div className="h-1 rounded-full bg-surface-subtle overflow-hidden">
                <div className="h-full rounded-full" style={{ background: fg, width: `${skill.score * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex gap-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-none bg-positive" />
          <div>
            <div className="text-[14px] font-medium mb-0.5">Уже выше уровня</div>
            <div className="text-body-secondary">{placementResult.aboveLevel}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-none bg-negative" />
          <div>
            <div className="text-[14px] font-medium mb-0.5">Тянет уровень вниз</div>
            <div className="text-body-secondary">{placementResult.belowLevel}</div>
          </div>
        </div>
      </div>

      <div className="text-body-secondary">Программа собрана из этих слабых мест: 14 тем до {to}, первые четыре — грамматический фундамент.</div>
      <Button size="lg" onClick={goSchedule} className="w-full">
        Настроить расписание
      </Button>
    </div>
  );
}
