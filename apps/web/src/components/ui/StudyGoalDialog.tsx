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
  return open ? (
    <Dialog open onOpenChange={() => {}} headline="Сколько карточек в день вы готовы учить?">
      <StudyGoalForm key={userId} />
    </Dialog>
  ) : null;
}

export function StudyGoalForm({ currentGoal = null, onClose }: {
  currentGoal?: DailyCardGoal | null;
  onClose?: () => void;
}) {
  const save = useAppStore((s) => s.saveStudyGoal);
  const [goal, setGoal] = useState<DailyCardGoal | null>(currentGoal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    if (!goal || saving) return;
    setSaving(true);
    setError(false);
    try {
      await save(goal);
      onClose?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-4">
      {!onClose && <p>Расчёт на 5 дней занятий и 2 дня отдыха. Часть фраз нужно будет повторить, чтобы запомнить. Цель можно изменить в профиле.</p>}
      <fieldset className="grid grid-cols-2 gap-2" disabled={saving}>
        <legend className="sr-only">Карточек в день</legend>
        {DAILY_CARD_GOALS.map((option) => (
          <label key={option} className={`cursor-pointer rounded-[var(--radius-md)] border p-2.5 flex flex-col gap-1 focus-within:ring-2 focus-within:ring-accent ${goal === option ? 'border-accent bg-accent-subtle' : 'border-border'}`}>
            <input type="radio" name="daily-card-goal" className="sr-only" checked={goal === option} onChange={() => setGoal(option)} />
            <span className="font-semibold text-text">{option} в день</span>
            {!onClose && <>
              <span className="text-meta">≈ {option}–{option * 2} мин/день</span>
              <span className="text-meta">до {option * 5} фраз/нед.</span>
            </>}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-negative">Не удалось сохранить цель. Попробуйте ещё раз.</p>}
      <div className="flex gap-2">
        {onClose && <Button variant="ghost" disabled={saving} onClick={onClose}>Отмена</Button>}
        <Button type="submit" disabled={!goal || goal === currentGoal || saving} className="flex-1">
          {saving ? 'Сохраняем…' : 'Сохранить цель'}
        </Button>
      </div>
    </form>
  );
}
