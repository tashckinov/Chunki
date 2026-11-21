import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/Button';

export function ResultScreen() {
  const { placementResult, placementResultOwner, placementResultGoal, placementResultSkipSchedule, gradingError, user, authChecked, to, goSchedule, go } = useAppStore();
  const goal = placementResultGoal ?? to;

  if (!authChecked && !user) return null;

  if (!placementResult || (placementResultOwner && placementResultOwner !== user?.id)) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Не получилось проверить тест</div>
        <div className="text-body-secondary">{gradingError || 'Попробуйте ещё раз.'}</div>
        <Button size="sm" onClick={() => go('program')}>
          К грамматике
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
          Цель: {goal} · {placementResult.mcqScore.correct}/{placementResult.mcqScore.total} по грамматике
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

      {placementResult.review && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-section-title">Разбор ошибок</h2>
          {placementResult.review.length === 0 && <p className="text-body-secondary">В этом тесте ошибок не найдено.</p>}
          {placementResult.review.map((item) => (
            <details key={item.key} className="rounded-[var(--radius-md)] border border-border p-4">
              <summary className="cursor-pointer font-medium">
                {item.key === 'essay' ? 'Письменное задание' : `Вопрос ${item.key}`} · <span lang="en">{item.prompt}</span>
              </summary>
              <dl className="mt-3 flex flex-col gap-2 break-words">
                <div>
                  <dt className="text-meta">Ваш ответ</dt>
                  <dd className="whitespace-pre-wrap">{item.answer || 'Нет ответа'}</dd>
                </div>
                {item.correction && (
                  <div>
                    <dt className="text-meta">{Number(item.key) <= 8 ? 'Правильный ответ' : 'Вариант ответа'}</dt>
                    <dd lang="en" className="whitespace-pre-wrap text-positive">{item.correction}</dd>
                  </div>
                )}
              </dl>
              {[...new Set([item.feedback, item.grammar, item.naturalness].filter(Boolean))].map((note) => <p key={note} className="mt-2 text-body-secondary">{note}</p>)}
            </details>
          ))}
        </section>
      )}
      {!placementResultSkipSchedule && placementResult.topics.length > 0 && (
        <div className="text-body-secondary">Тем в программе до {goal} по результатам теста: {placementResult.topics.length}.</div>
      )}
      <Button size="lg" onClick={placementResultSkipSchedule ? () => go('program') : goSchedule} className="w-full">
        {placementResultSkipSchedule ? 'К программе' : 'Настроить расписание'}
      </Button>
    </div>
  );
}
