import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { fetchAdminPayments, type AdminPayment } from '../../lib/admin';

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  paid: { label: 'Оплачено', className: 'text-positive' },
  pending: { label: 'Ожидает', className: 'text-text-secondary' },
  failed: { label: 'Не удалось', className: 'text-negative' },
  cancelled: { label: 'Отменено', className: 'text-text-secondary' },
};

const PLAN_LABEL: Record<string, string> = { monthly: 'Месяц', yearly: 'Год' };

export function PaymentsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPayments()
      .then(setPayments)
      .catch(() => setError('Не удалось загрузить платежи.'));
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Платежи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        {error && <div className="px-5 py-4 text-negative">{error}</div>}
        {!error && !payments && <div className="px-5 py-4 text-body-secondary">Загрузка…</div>}
        {!error && payments && (
          <div className="flex flex-col gap-3 px-5 py-4">
            {payments.length === 0 && <div className="text-body-secondary">Пока нет ни одного платежа.</div>}
            {payments.map((p) => {
              const status = STATUS_COPY[p.status] ?? { label: p.status, className: '' };
              return (
                <div key={p.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14.5px] font-medium">{p.userEmail ?? '—'}</div>
                    <span className={`text-[12px] font-medium ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="text-[13.5px] text-text-secondary">
                    {PLAN_LABEL[p.plan] ?? p.plan}
                    {p.amount ? ` · ${p.amount} ${p.currency ?? ''}` : ''} · {p.provider}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-meta">
                    <span>{new Date(p.createdAt).toLocaleString('ru-RU')}</span>
                    <span className="truncate">{p.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
