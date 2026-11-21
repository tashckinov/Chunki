import { useState } from 'react';
import { DAILY_CARD_GOALS, type DailyCardGoal } from '@app/shared';
import { useAppStore } from '../../store/appStore';
import { Button } from './Button';
import { Dialog } from './Dialog';

export function StudyGoalDialog() {
  const userId = useAppStore((s) => s.user?.id);
  const screen = useAppStore((s) => s.screen);
  const status = useAppStore((s) => s.studyGoal);
  const completedIntroOwner = useAppStore((s) => s.completedIntroOwner);
  const open = Boolean(userId && screen !== 'deckdone' && !status?.dailyCardGoal
    && (status?.introCompleted || completedIntroOwner === userId));
  return open ? <StudyGoalForm key={userId} /> : null;
}

function StudyGoalForm() {
  const save = useAppStore((s) => s.saveStudyGoal);
  const [goal, setGoal] = useState<DailyCardGoal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    if (!goal || saving) return;
    setSaving(true);
    setError(false);
    try {
      await save(goal);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}} headline="Сколько карточек в день вы готовы учить?">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-4">
        <p>Расчёт на 5 дней занятий и 2 дня отдыха. Часть фраз нужно будет повторить, чтобы запомнить.</p>
        <fieldset className="grid grid-cols-2 gap-2" disabled={saving}>
          <legend className="sr-only">Карточек в день</legend>
          {DAILY_CARD_GOALS.map((option) => (
            <label key={option} className={`cursor-pointer rounded-[var(--radius-md)] border p-2.5 flex flex-col gap-1 focus-within:ring-2 focus-within:ring-accent ${goal === option ? 'border-accent bg-accent-subtle' : 'border-border'}`}>
              <input type="radio" name="daily-card-goal" className="sr-only" checked={goal === option} onChange={() => setGoal(option)} />
              <span className="font-semibold text-text">{option} в день</span>
              <span className="text-meta">≈ {option}–{option * 2} мин/день</span>
              <span className="text-meta">до {option * 5} фраз/нед.</span>
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-negative">Не удалось сохранить цель. Попробуйте ещё раз.</p>}
        <Button type="submit" disabled={!goal || saving} className="w-full">
          {saving ? 'Сохраняем…' : 'Сохранить цель'}
        </Button>
      </form>
    </Dialog>
  );
}
