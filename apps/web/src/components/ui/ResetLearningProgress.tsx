import { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { postJson } from '../../lib/collections';
import { useAppStore } from '../../store/appStore';

const phrase = 'Я УВЕРЕН';
const titles = ['Вы точно уверены?', 'Подтвердите намерение', 'Сбросить прогресс?'];

export function ResetLearningProgress({ userId }: { userId: string }) {
  const [step, setStep] = useState(0);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  function close() {
    if (busy) return;
    setStep(0);
    setConfirmation('');
    setError(false);
  }

  async function reset() {
    if (busy || step !== 3 || confirmation.trim() !== phrase) return;
    setBusy(true);
    setError(false);
    try {
      await postJson('/api/program/reset-progress', { confirmation: phrase });
      if (useAppStore.getState().user?.id !== userId) return;
      useAppStore.setState({
        dailySession: null, learningTopic: null, activeTopicId: null, currentAttempt: null,
        topicAnswers: {}, exerciseDrafts: {}, exerciseResult: null,
      });
      void useAppStore.getState().loadProgram();
      close();
      setSuccess(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Button size="sm" variant="ghost" className="text-negative" onClick={() => { setSuccess(false); setStep(1); }}>
        Сбросить прогресс обучения
      </Button>
      {success && <p role="status" className="text-meta">Прогресс программы сброшен.</p>}
      <Dialog key={step} open={step > 0} onOpenChange={(open) => { if (!open) close(); }} headline={titles[step - 1]}
        actions={<>
          <Button size="sm" variant="secondary" disabled={busy} onClick={close}>Отмена</Button>
          {step < 3 ? (
            <Button size="sm" disabled={step === 2 && confirmation.trim() !== phrase}
              onClick={() => setStep(step + 1)}>Продолжить</Button>
          ) : (
            <Button size="sm" disabled={busy} variant="secondary" className="bg-negative-subtle text-negative" onClick={() => void reset()}>
              {busy ? 'Сбрасываем…' : 'Сбросить прогресс'}
            </Button>
          )}
        </>}>
        <p className="mb-2 text-meta">Шаг {step} из 3</p>
        {step === 1 && <p>Прогресс по персональной программе сбросится. Рекомендованные темы можно будет пройти заново. Темы на повторение, результаты тестов и история попыток сохранятся.</p>}
        {step === 2 && <label className="grid gap-2">Введите «{phrase}».
          <input value={confirmation} autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
            className="min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-text" />
        </label>}
        {step === 3 && <p>Отменить сброс после подтверждения нельзя. Результаты тестирования, использованные попытки и темы на повторение сохранятся. Дополнительные темы, которые не ждут повторения, уйдут из плана.</p>}
        {error && <p role="alert" className="mt-2 text-negative">Не удалось сбросить прогресс. Попробуйте ещё раз.</p>}
      </Dialog>
    </div>
  );
}
