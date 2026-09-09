import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { Button } from '../../components/ui/Button';
import { fetchAdminUsers, setUserPremiumUntil, resetProductionChecks, type AdminUser } from '../../lib/admin';

const FREE_PRODUCTION_CHECKS_LIMIT = 3;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isPremiumActive(premiumUntil: string | null): boolean {
  return !!premiumUntil && new Date(premiumUntil).getTime() > Date.now();
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function UsersSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => setError('Не удалось загрузить пользователей.'));
  }, []);

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
      const updated = await resetProductionChecks(userId);
      setUsers((prev) => prev?.map((u) => (u.id === userId ? updated : u)) ?? prev);
    } catch {
      setError('Не удалось сбросить попытки.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Пользователи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        {error && <div className="px-5 py-4 text-negative">{error}</div>}
        {!error && !users && <div className="px-5 py-4 text-body-secondary">Загрузка…</div>}
        {!error && users && (
          <div className="flex flex-col gap-3 px-5 py-4">
            {users.length === 0 && <div className="text-body-secondary">Пользователей пока нет.</div>}
            {users.map((u) => (
              <div key={u.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-medium truncate">{u.displayName || u.email || u.id}</div>
                    {u.email && <div className="text-meta truncate">{u.email}</div>}
                  </div>
                  {isPremiumActive(u.premiumUntil) && (
                    <span className="flex-none text-[12px] font-medium text-accent bg-accent-subtle rounded-full px-2.5 py-1">Premium</span>
                  )}
                </div>
                <div className="text-meta">
                  Регистрация: {formatDate(u.createdAt)} · Последний вход: {formatDate(u.lastLoginAt)}
                </div>
                <div className="text-[13.5px]">
                  Подписка до: <span className="font-medium">{formatDate(u.premiumUntil)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span>
                    Проверок предложений: {u.productionChecksUsed}/{FREE_PRODUCTION_CHECKS_LIMIT}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => resetChecks(u.id)}>
                    Сбросить попытки
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => apply(u.id, addDaysIso(30))}>
                    +30 дней
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => apply(u.id, addDaysIso(365))}>
                    +365 дней
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => apply(u.id, null)}>
                    Отменить
                  </Button>
                  <input
                    type="date"
                    value={customDate[u.id] ?? ''}
                    onChange={(e) => setCustomDate((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    className="rounded-[var(--radius-md)] bg-surface-subtle px-3 py-2 text-[13.5px] outline-none"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === u.id || !customDate[u.id]}
                    onClick={() => apply(u.id, new Date(customDate[u.id]).toISOString())}
                  >
                    Задать дату
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
