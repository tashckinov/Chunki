import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { fetchAdminProgramTopics, type AdminProgramTopic } from '../../lib/admin';

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  assigned: { label: 'Изучить', className: 'text-text-secondary' },
  passed_once: { label: 'Ждёт переподтверждения', className: 'text-warning' },
  mastered: { label: 'Подтверждено', className: 'text-positive' },
};

const SOURCE_COPY: Record<string, string> = { placement: 'тест', discovered: 'найдено ИИ' };

export function ProgramSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [topics, setTopics] = useState<AdminProgramTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminProgramTopics()
      .then(setTopics)
      .catch(() => setError('Не удалось загрузить программу.'));
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Программа" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        {error && <div className="px-5 py-4 text-negative">{error}</div>}
        {!error && !topics && <div className="px-5 py-4 text-body-secondary">Загрузка…</div>}
        {!error && topics && (
          <div className="flex flex-col gap-3 px-5 py-4">
            {topics.length === 0 && <div className="text-body-secondary">Пока нет ни одной темы.</div>}
            {topics.map((t) => {
              const status = STATUS_COPY[t.status] ?? { label: t.status, className: '' };
              return (
                <div key={t.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14.5px] font-medium">{t.userEmail ?? '—'}</div>
                    <span className={`text-[12px] font-medium ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="text-[13.5px] text-text-secondary">
                    {t.title} · {t.category} · {SOURCE_COPY[t.source] ?? t.source}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-meta">
                    <span>{new Date(t.updatedAt).toLocaleString('ru-RU')}</span>
                    {t.nextReviewAt && <span>до {new Date(t.nextReviewAt).toLocaleDateString('ru-RU')}</span>}
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
