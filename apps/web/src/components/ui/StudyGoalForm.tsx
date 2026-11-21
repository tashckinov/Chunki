import { useState } from 'react';
import { DAILY_CARD_GOALS, type DailyCardGoal } from '@app/shared';
import { useAppStore } from '../../store/appStore';
import { Button } from './Button';

export function useStudyGoalForm(initialGoal: DailyCardGoal | null, onSaved?: () => void) {
  const save = useAppStore((s) => s.saveStudyGoal);
  const [goal, setGoal] = useState<DailyCardGoal | null>(initialGoal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    if (!goal || saving) return;
    setSaving(true);
    setError(false);
    try {
      await save(goal);
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return { goal, setGoal, saving, error, submit };
}

export function StudyGoalForm({ currentGoal, onClose }: {
  currentGoal: DailyCardGoal;
  onClose: () => void;
}) {
  const { goal, setGoal, saving, error, submit } = useStudyGoalForm(currentGoal, onClose);
  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2" disabled={saving}>
        <legend className="sr-only">Карточек в день</legend>
        {DAILY_CARD_GOALS.map((option) => (
          <label key={option} className={`cursor-pointer rounded-[var(--radius-md)] border p-2.5 flex flex-col gap-1 focus-within:ring-2 focus-within:ring-accent ${goal === option ? 'border-accent bg-accent-subtle' : 'border-border'}`}>
            <input type="radio" name="daily-card-goal" className="sr-only" checked={goal === option} onChange={() => setGoal(option)} />
            <span className="font-semibold text-text">{option} в день</span>
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-negative">Не удалось сохранить цель. Попробуйте ещё раз.</p>}
      <div className="flex gap-2">
        <Button variant="ghost" disabled={saving} onClick={onClose}>Отмена</Button>
        <Button type="submit" disabled={!goal || goal === currentGoal || saving} className="flex-1">
          {saving ? 'Сохраняем…' : 'Сохранить цель'}
        </Button>
      </div>
    </form>
  );
}
