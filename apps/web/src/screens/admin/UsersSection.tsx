import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { useAppStore } from '../../store/appStore';
import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { ApiError } from '../../lib/collections';
import { Button } from '../../components/ui/Button';
import { fetchAdminUsers, setUserPremiumUntil, resetDailyChecks, fetchAdminTariffs, regenerateUserProgram, type AdminUser, type AdminTariff } from '../../lib/admin';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
}

function isPremiumActive(premiumUntil: string | null): boolean {
  return !!premiumUntil && new Date(premiumUntil).getTime() > Date.now();
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Mirrors the server's effectiveDailyChecksUsed (subscriptionTariffs/service.ts) — the stored count only reflects today's usage when its date matches today. */
function effectiveDailyChecksUsed(dailyChecksUsed: number, dailyChecksDate: string | null): number {
  const today = new Date().toISOString().slice(0, 10);
  return dailyChecksDate === today ? dailyChecksUsed : 0;
}

export function UsersSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [tariffs, setTariffs] = useState<AdminTariff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [customDate, setCustomDate] = useState('');
  const selected = users?.find(({ id }) => id === selectedId);

  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [programFeedback, setProgramFeedback] = useState<{ id: string; message: string; error: boolean }>();

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => setError('Не удалось загрузить пользователей.'));
    fetchAdminTariffs()
      .then(setTariffs)
      .catch(() => {});
  }, []);

  function effectiveTariff(u: AdminUser) {
    const paid = isPremiumActive(u.premiumUntil);
    const subscribed = paid && u.currentTariffId ? tariffs?.find(({ id }) => id === u.currentTariffId) : undefined;
    const fallback = tariffs?.find(({ isDefault }) => isDefault);
    return subscribed ?? fallback;
  }

  function tariffLabel(u: AdminUser) {
    if (u.isAdmin) return 'Администратор';
    const paid = isPremiumActive(u.premiumUntil);
    return (paid && !u.currentTariffId ? 'Premium' : effectiveTariff(u)?.name) ?? (paid ? 'Premium' : 'Бесплатный');
  }

  function history(userId: string) {
    useAppStore.setState({ adminSection: 'analytics', analyticsUser: userId });
  }

  async function apply(userId: string, premiumUntil: string | null) {
    setBusyId(userId);
    setError(null);
    try {
      const updated = await setUserPremiumUntil(userId, premiumUntil);
      setUsers((prev) => prev?.map((u) => (u.id === userId ? updated : u)) ?? prev);
    } catch {
      setError('Не удалось обновить подписку.');
    } finally {
      setBusyId(null);
    }
  }

  async function resetChecks(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      const updated = await resetDailyChecks(userId);
      setUsers((prev) => prev?.map((u) => (u.id === userId ? updated : u)) ?? prev);
    } catch {
      setError('Не удалось сбросить попытки.');
    } finally {
      setBusyId(null);
    }
  }

  async function regenerate(userId: string) {
    setRegenerating(userId);
    setProgramFeedback(undefined);
    try {
      await regenerateUserProgram(userId);
      setProgramFeedback({ id: userId, message: 'Программа обновлена по последнему тесту.', error: false });
    } catch (err) {
      let message = 'Не удалось обновить программу. Попробуйте ещё раз.';
      if (err instanceof ApiError && err.status === 404) message = 'У ученика ещё нет результата теста.';
      if (err instanceof ApiError && err.status === 409) message = 'Тест или программа уже обрабатывается. Попробуйте чуть позже.';
      setProgramFeedback({ id: userId, message, error: true });
    } finally {
      setRegenerating(null);
    }
  }

  const columns: DataTableColumn<AdminUser>[] = [
    { id: 'name', label: 'Пользователь', sortValue: (u) => u.displayName || u.email || u.id,
      cell: (u) => <div className="min-w-44">
        <div className="font-medium wrap-anywhere">{u.displayName || u.email || u.id}</div>
        {u.displayName && u.email && u.displayName !== u.email && <div className="text-meta wrap-anywhere">{u.email}</div>}
      </div> },
    { id: 'tariff', label: 'Тариф', sortValue: tariffLabel,
      cell: (u) => <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${isPremiumActive(u.premiumUntil) ? 'bg-accent-subtle text-accent' : 'bg-surface-subtle text-text-secondary'}`}>
        {tariffLabel(u)}
      </span> },
    { id: 'expiry', label: 'Окончание подписки', sortValue: (u) => u.premiumUntil ? Date.parse(u.premiumUntil) : null,
      cell: (u) => <span className={`whitespace-nowrap tabular-nums ${u.premiumUntil && !isPremiumActive(u.premiumUntil) ? 'text-negative' : ''}`}>{formatDate(u.premiumUntil)}</span> },
    { id: 'registered', label: 'Регистрация', sortValue: (u) => Date.parse(u.createdAt),
      cell: (u) => <span className="whitespace-nowrap tabular-nums">{formatDate(u.createdAt)}</span> },
    { id: 'login', label: 'Последний вход', sortValue: (u) => u.lastLoginAt ? Date.parse(u.lastLoginAt) : null,
      cell: (u) => <span className="whitespace-nowrap tabular-nums">{formatDate(u.lastLoginAt)}</span> },
    { id: 'checks', label: 'Проверки сегодня', sortValue: (u) => effectiveDailyChecksUsed(u.dailyChecksUsed, u.dailyChecksDate),
      cell: (u) => {
        const used = effectiveDailyChecksUsed(u.dailyChecksUsed, u.dailyChecksDate);
        const limit = effectiveTariff(u)?.dailyCheckLimit;
        return <span className="whitespace-nowrap tabular-nums">{used}{u.isAdmin || limit === null ? ' / ∞' : limit === undefined ? '' : ` / ${limit}`}</span>;
      } },
    { id: 'actions', label: 'Действия', cell: (u) => <div className="flex gap-1 whitespace-nowrap">
      <Button size="sm" variant="secondary" onClick={() => {
        setSelectedId(u.id);
        setCustomDate('');
        setError(null);
      }}>Управлять</Button>
      <Button size="sm" variant="ghost" onClick={() => history(u.id)}>История</Button>
    </div> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar title="Пользователи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean min-h-0 flex-1 px-3 py-4 sm:px-5">
        {!selected && error && <p role="alert" className="mb-3 text-negative">{error}</p>}
        {!error && !users && <p role="status" className="text-body-secondary">Загрузка…</p>}
        {users?.length === 200 && <p className="mb-3 text-meta">Показаны последние 200 зарегистрированных пользователей.</p>}
        {users && <DataTable rows={users} columns={columns} rowKey={(u) => u.id}
          label="Пользователи Chunki" empty="Пользователей пока нет." />}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => {
        if (!open && !busyId && !regenerating) { setSelectedId(undefined); setError(null); }
      }} headline={selected?.displayName || selected?.email || 'Управление пользователем'}>
        {selected && <div className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium text-text">{tariffLabel(selected)} · до {formatDate(selected.premiumUntil)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busyId} onClick={() => void apply(selected.id, addDaysIso(30))}>+30 дней</Button>
              <Button size="sm" variant="secondary" disabled={!!busyId} onClick={() => void apply(selected.id, addDaysIso(365))}>+365 дней</Button>
              <Button size="sm" variant="ghost" disabled={!!busyId} onClick={() => void apply(selected.id, null)}>Отменить подписку</Button>
            </div>
            <label className="block text-meta">Дата окончания
              <input type="date" value={customDate} disabled={!!busyId} onChange={(event) => setCustomDate(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-text" />
            </label>
            <Button size="sm" variant="secondary" disabled={!!busyId || !customDate}
              onClick={() => void apply(selected.id, new Date(customDate).toISOString())}>Задать дату</Button>
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <Button size="sm" variant="ghost" disabled={!!busyId} onClick={() => void resetChecks(selected.id)}>Сбросить попытки</Button>
            <Button size="sm" variant="secondary" disabled={!!regenerating} onClick={() => void regenerate(selected.id)}>
              {regenerating === selected.id ? 'Подбираем темы…' : 'Пересобрать программу'}
            </Button>
            {programFeedback?.id === selected.id && <p role={programFeedback.error ? 'alert' : 'status'}
              className={programFeedback.error ? 'text-negative' : 'text-positive'}>{programFeedback.message}</p>}
            {error && <p role="alert" className="text-negative">{error}</p>}
          </div>
          <Button size="sm" variant="ghost" disabled={!!busyId || !!regenerating}
            onClick={() => { setSelectedId(undefined); setError(null); }}>Закрыть</Button>
        </div>}
      </Dialog>
    </div>
  );
}
