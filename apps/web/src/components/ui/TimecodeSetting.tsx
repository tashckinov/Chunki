import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { redeemTimecode } from '../../lib/timecodes';
import { Button } from './Button';

const ERRORS: Record<string, string> = {
  invalid_code: 'Таймкод не найден или недоступен.',
  already_redeemed: 'Вы уже активировали этот таймкод.',
  code_exhausted: 'Все активации этого таймкода уже использованы.',
  different_active_tariff: 'У вас уже действует другой тариф. Этот код можно использовать после его окончания.',
  rate_limit: 'Слишком много попыток. Попробуйте позже.',
};

export function TimecodeSetting() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function activate() {
    const userId = useAppStore.getState().user?.id;
    if (!userId || !code.trim() || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await redeemTimecode(code);
      if ('error' in result) {
        setError(ERRORS[result.error] ?? 'Не удалось активировать таймкод.');
        return;
      }
      if (useAppStore.getState().user?.id === userId) {
        useAppStore.setState({ premiumUntil: result.premiumUntil, isPremium: result.isPremium });
      }
      setCode('');
      setSuccess(`Таймкод активирован. Доступ до ${new Date(result.premiumUntil).toLocaleDateString('ru-RU')}.`);
    } catch {
      setError('Не удалось активировать таймкод. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void activate(); }}>
      <label className="flex flex-col gap-1 text-[14px] font-medium">Таймкод подписки
        <input value={code} maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={(event) => setCode(event.target.value)} placeholder="Введите код"
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-text" />
      </label>
      <Button size="sm" variant="secondary" type="submit" disabled={!code.trim() || busy}>
        {busy ? 'Активируем…' : 'Активировать'}
      </Button>
      {error && <p role="alert" className="text-[13px] text-negative">{error}</p>}
      {success && <p role="status" className="text-[13px] text-positive">{success}</p>}
    </form>
  );
}
