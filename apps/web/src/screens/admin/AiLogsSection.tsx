import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { fetchAdminAiLogs, fetchProductionModelStats, type AdminAiLog, type ProductionModelStats } from '../../lib/admin';

interface ProductionJudgeRequest {
  chunkText?: string;
  situationPrompt?: string;
  userAnswer?: string;
}

interface ProductionJudgeResponse {
  verdict?: string;
  feedback?: string;
}

export function AiLogsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [logs, setLogs] = useState<AdminAiLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<ProductionModelStats[] | null>(null);
  const [statsError, setStatsError] = useState(false);
  const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

  useEffect(() => {
    fetchProductionModelStats().then(setModels).catch(() => setStatsError(true));
    fetchAdminAiLogs()
      .then(setLogs)
      .catch(() => setError('Не удалось загрузить логи.'));
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="AI-логи" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <section className="px-5 pt-4">
          <h2 className="font-semibold">Статистика моделей</h2>
          {statsError && <p className="text-negative">Не удалось загрузить статистику.</p>}
          {!statsError && !models && <p className="text-body-secondary">Загрузка…</p>}
          {models?.length === 0 && <p className="text-body-secondary">Пока нет проверок.</p>}
          {!!models?.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead><tr>
                  <th className="p-2">Модель</th><th className="p-2">Вызовы</th><th className="p-2">Ошибки</th>
                  <th className="p-2">👍</th><th className="p-2">👎</th><th className="p-2">Доля 👍</th>
                </tr></thead>
                <tbody>
                  {models.map(({ model, calls, errors, up, down }) => (
                    <tr key={model} className="border-t border-border">
                      <td className="p-2">{model}</td><td className="p-2">{calls}</td>
                      <td className="p-2">{errors} ({percent.format(errors / calls)})</td>
                      <td className="p-2">{up}</td><td className="p-2">{down}</td>
                      <td className="p-2">{up + down > 0 ? percent.format(up / (up + down)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {error && <div className="px-5 py-4 text-negative">{error}</div>}
        {!error && !logs && <div className="px-5 py-4 text-body-secondary">Загрузка…</div>}
        {!error && logs && (
          <div className="flex flex-col gap-3 px-5 py-4">
            {logs.length === 0 && <div className="text-body-secondary">Пока нет записей — они появятся после первой продакшн-проверки.</div>}
            {logs.map((log) => {
              const req = log.request as ProductionJudgeRequest;
              const res = log.response as ProductionJudgeResponse | null;
              return (
                <div key={log.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-meta">
                    <span>{new Date(log.createdAt).toLocaleString('ru-RU')}</span>
                    <span>
                      {log.provider}
                      {log.model ? ` · ${log.model}` : ''} · {log.durationMs} мс
                    </span>
                  </div>
                  <div className="text-[13.5px]">
                    {req.chunkText && <span className="font-medium">{req.chunkText}</span>}
                    {log.userEmail && <span className="text-text-secondary"> · {log.userEmail}</span>}
                  </div>
                  {req.situationPrompt && <div className="text-[13.5px] text-text-secondary">Ситуация: {req.situationPrompt}</div>}
                  {req.userAnswer && <div className="text-[13.5px]">Ответ: «{req.userAnswer}»</div>}
                  {log.error ? (
                    <div className="text-[13.5px] text-negative">Ошибка: {log.error}</div>
                  ) : (
                    res && (
                      <div className="text-[13.5px]">
                        Вердикт: <span className="font-medium">{res.verdict}</span>
                        {res.feedback && <span className="text-text-secondary"> — {res.feedback}</span>}
                      </div>
                    )
                  )}
                  <details className="text-meta">
                    <summary className="cursor-pointer">Полный JSON</summary>
                    <pre className="whitespace-pre-wrap break-all mt-1 text-[12px]">
                      {JSON.stringify({ request: log.request, response: log.response }, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
