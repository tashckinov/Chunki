import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { Button } from '../../components/ui/Button';
import { fetchAdminTariffs, type AdminTariff } from '../../lib/admin';
import { createTimecode, fetchTimecodes, type Timecode } from '../../lib/timecodes';
import { plural } from '../../lib/plural';

export function TimecodesSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [tariffs, setTariffs] = useState<AdminTariff[]>([]);
  const [history, setHistory] = useState<Timecode[] | null>(null);
  const [tariffId, setTariffId] = useState('');
  const [months, setMonths] = useState('3');
  const [uses, setUses] = useState('1');
  const [issued, setIssued] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchAdminTariffs(), fetchTimecodes()]).then(([items, codes]) => {
      if (!active) return;
      const available = items.filter((tariff) => !tariff.isDefault);
      setTariffs(available);
      setTariffId(available[0]?.id ?? '');
      setHistory(codes);
    }).catch(() => { if (active) setError('Не удалось загрузить таймкоды и тарифы.'); });
    return () => { active = false; };
  }, []);

  async function issue() {
    if (!tariffId || saving) return;
    setSaving(true);
    setError('');
    try {
      const { code, ...timecode } = await createTimecode(tariffId, Number(months), Number(uses));
      setIssued(code);
      setCopied(false);
      setHistory((entries) => [timecode, ...(entries ?? [])].slice(0, 100));
    } catch {
      setError('Не удалось создать таймкод. Проверьте тариф, срок и число активаций.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar title="Таймкоды" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 space-y-5 px-5 py-4">
        <form className="space-y-3 rounded-2xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); void issue(); }}>
          <h2 className="text-section-title">Создать таймкод</h2>
          <p className="text-meta">Доступ начнётся при активации и закончится без автопродления.</p>
          <label className="flex flex-col gap-1 text-[14px]">Тариф
            <select required value={tariffId} onChange={(event) => setTariffId(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3">
              {tariffs.length === 0 && <option value="">Нет доступных тарифов</option>}
              {tariffs.map((tariff) => <option key={tariff.id} value={tariff.id}>{tariff.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-[14px]">Длительность, месяцев
              <input required type="number" min={1} max={120} value={months} onChange={(event) => setMonths(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[14px]">Количество активаций
              <input required type="number" min={1} max={10000} value={uses} onChange={(event) => setUses(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3" />
            </label>
          </div>
          <Button type="submit" disabled={!tariffId || saving}>{saving ? 'Создаём…' : 'Создать таймкод'}</Button>
        </form>
        {error && <p role="alert" className="text-negative">{error}</p>}
        {issued && (
          <section className="flex flex-col gap-2 rounded-2xl bg-accent-subtle p-4" aria-live="polite">
            <h2 className="font-semibold">Таймкод создан</h2>
            <code className="select-all wrap-anywhere font-semibold text-accent">{issued}</code>
            <p className="text-meta">Скопируйте код сейчас. В истории будут видны только последние символы.</p>
            <Button size="sm" variant="secondary" className="self-start" onClick={() => {
              void navigator.clipboard.writeText(issued).then(() => setCopied(true)).catch(() => setCopied(false));
            }}>{copied ? 'Скопировано' : 'Скопировать'}</Button>
          </section>
        )}
        <section className="space-y-2">
          <h2 className="text-section-title">Последние таймкоды</h2>
          {history?.length === 0 && <p className="text-meta">Таймкодов пока нет.</p>}
          {history?.map((code) => (
            <div key={code.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div>
                <div className="font-medium">{code.tariffName ?? 'Тариф удалён'} · {code.months} {plural(code.months, 'месяц', 'месяца', 'месяцев')}</div>
                <div className="text-meta">…{code.codeHint} · {new Date(code.createdAt).toLocaleDateString('ru-RU')}</div>
              </div>
              <span className="text-meta">Активации {code.usedCount} / {code.maxUses}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
