import { useEffect, useState } from 'react';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import {
  fetchAdminPayments,
  fetchAdminTariffs,
  createAdminTariff,
  updateAdminTariff,
  deleteAdminTariff,
  type AdminPayment,
  type AdminTariff,
  type TariffInput,
  type TariffPeriodicity,
} from '../../lib/admin';

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  paid: { label: 'Оплачено', className: 'text-positive' },
  pending: { label: 'Ожидает', className: 'text-text-secondary' },
  failed: { label: 'Не удалось', className: 'text-negative' },
  cancelled: { label: 'Отменено', className: 'text-text-secondary' },
};

const PLAN_LABEL: Record<string, string> = { monthly: 'Месяц', yearly: 'Год' };
const PERIODICITY_OPTIONS: { value: TariffPeriodicity; label: string }[] = [
  { value: 'monthly', label: 'Месяц' },
  { value: 'yearly', label: 'Год' },
];

function toNumberOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

interface DraftState {
  name: string;
  periodicity: TariffPeriodicity;
  offerUrl: string;
  priceUsd: string;
  priceEur: string;
  priceRub: string;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: string;
  isDefault: boolean;
  position: string;
  upsellTariffIds: string[];
}

function toDraft(t: AdminTariff): DraftState {
  return {
    name: t.name,
    periodicity: t.periodicity,
    offerUrl: t.offerUrl ?? '',
    priceUsd: t.priceUsd ?? '',
    priceEur: t.priceEur ?? '',
    priceRub: t.priceRub ?? '',
    allowCards: t.allowCards,
    allowProgram: t.allowProgram,
    dailyCheckLimit: t.dailyCheckLimit === null ? '' : String(t.dailyCheckLimit),
    isDefault: t.isDefault,
    position: String(t.position),
    upsellTariffIds: t.upsellTariffIds,
  };
}

function draftsEqual(a: DraftState, b: DraftState): boolean {
  return (
    a.name === b.name &&
    a.periodicity === b.periodicity &&
    a.offerUrl === b.offerUrl &&
    a.priceUsd === b.priceUsd &&
    a.priceEur === b.priceEur &&
    a.priceRub === b.priceRub &&
    a.allowCards === b.allowCards &&
    a.allowProgram === b.allowProgram &&
    a.dailyCheckLimit === b.dailyCheckLimit &&
    a.isDefault === b.isDefault &&
    a.position === b.position &&
    a.upsellTariffIds.length === b.upsellTariffIds.length &&
    a.upsellTariffIds.every((id) => b.upsellTariffIds.includes(id))
  );
}

function toInput(d: DraftState): TariffInput {
  return {
    name: d.name.trim(),
    periodicity: d.periodicity,
    offerUrl: d.offerUrl.trim() || null,
    priceUsd: toNumberOrNull(d.priceUsd),
    priceEur: toNumberOrNull(d.priceEur),
    priceRub: toNumberOrNull(d.priceRub),
    allowCards: d.allowCards,
    allowProgram: d.allowProgram,
    dailyCheckLimit: toIntOrNull(d.dailyCheckLimit),
    isDefault: d.isDefault,
    position: toIntOrNull(d.position) ?? 0,
    upsellTariffIds: d.upsellTariffIds,
  };
}

/** One tariff's full editor — every entitlement the "конструктор подписки" exposes: periodicity, prices, deck/production-check access, program access, a daily check cap, which tariff is auto-assigned by default, and which other tariffs to suggest once this one's limit is hit. */
function TariffEditor({
  tariff,
  allTariffs,
  onSaved,
  onDeleted,
}: {
  tariff: AdminTariff;
  allTariffs: AdminTariff[];
  onSaved: (updated: AdminTariff) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(tariff));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const baseline = toDraft(tariff);
  const dirty = !draftsEqual(draft, baseline);
  const otherTariffs = allTariffs.filter((t) => t.id !== tariff.id);

  function patch(fields: Partial<DraftState>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  function toggleUpsell(id: string) {
    setDraft((d) => ({
      ...d,
      upsellTariffIds: d.upsellTariffIds.includes(id) ? d.upsellTariffIds.filter((x) => x !== id) : [...d.upsellTariffIds, id],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedJustNow(false);
    try {
      const updated = await updateAdminTariff(tariff.id, toInput(draft));
      onSaved(updated);
      setSavedJustNow(true);
    } catch {
      setError('Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminTariff(tariff.id);
      onDeleted(tariff.id);
    } catch {
      setError('Не удалось удалить.');
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-3">
      <div>
        <div className="text-meta mb-1.5">Название</div>
        <Input value={draft.name} onChange={(v) => patch({ name: v })} placeholder="Месяц" />
      </div>

      <div>
        <div className="text-meta mb-1.5">Периодичность</div>
        <SegmentedControl options={PERIODICITY_OPTIONS} value={draft.periodicity} onChange={(v) => patch({ periodicity: v })} />
      </div>

      <div>
        <div className="text-meta mb-1.5">Ссылка на оффер Lava.top</div>
        <Input value={draft.offerUrl} onChange={(v) => patch({ offerUrl: v })} placeholder="https://app.lava.top/products/.../..." />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-meta mb-1.5">$ USD</div>
          <Input value={draft.priceUsd} onChange={(v) => patch({ priceUsd: v })} placeholder="6.99" type="number" />
        </div>
        <div>
          <div className="text-meta mb-1.5">€ EUR</div>
          <Input value={draft.priceEur} onChange={(v) => patch({ priceEur: v })} placeholder="5.99" type="number" />
        </div>
        <div>
          <div className="text-meta mb-1.5">₽ RUB</div>
          <Input value={draft.priceRub} onChange={(v) => patch({ priceRub: v })} placeholder="599" type="number" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px]">Доступны карточки (колоды)</span>
        <Switch checked={draft.allowCards} onChange={(v) => patch({ allowCards: v })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px]">Доступна программа обучения</span>
        <Switch checked={draft.allowProgram} onChange={(v) => patch({ allowProgram: v })} />
      </div>

      <div>
        <div className="text-meta mb-1.5">Проверок предложений в день (пусто — без ограничения)</div>
        <Input value={draft.dailyCheckLimit} onChange={(v) => patch({ dailyCheckLimit: v })} placeholder="∞" type="number" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px]">Тариф по умолчанию для новых/истёкших пользователей</span>
        <Switch checked={draft.isDefault} onChange={(v) => patch({ isDefault: v })} />
      </div>

      <div>
        <div className="text-meta mb-1.5">Порядок отображения</div>
        <Input value={draft.position} onChange={(v) => patch({ position: v })} placeholder="0" type="number" />
      </div>

      {otherTariffs.length > 0 && (
        <div>
          <div className="text-meta mb-1.5">Предлагать после исчерпания лимита</div>
          <div className="flex flex-col gap-1.5">
            {otherTariffs.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={draft.upsellTariffIds.includes(t.id)} onChange={() => toggleUpsell(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-negative text-[13.5px]">{error}</div>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || deleting || !dirty}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} disabled={saving || deleting}>
          {deleting ? 'Удаляем…' : 'Удалить'}
        </Button>
        {!dirty && savedJustNow && <span className="text-positive text-[13px]">Сохранено ✓</span>}
      </div>
    </div>
  );
}

const NEW_TARIFF_INPUT: TariffInput = {
  name: 'Новый тариф',
  periodicity: 'monthly',
  offerUrl: null,
  priceUsd: null,
  priceEur: null,
  priceRub: null,
  allowCards: true,
  allowProgram: true,
  dailyCheckLimit: null,
  isDefault: false,
  position: 0,
  upsellTariffIds: [],
};

export function PaymentsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [tariffs, setTariffs] = useState<AdminTariff[] | null>(null);
  const [tariffsError, setTariffsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminTariffs()
      .then(setTariffs)
      .catch(() => setTariffsError('Не удалось загрузить тарифы.'));
    fetchAdminPayments()
      .then(setPayments)
      .catch(() => setError('Не удалось загрузить платежи.'));
  }, []);

  function handleSaved(updated: AdminTariff) {
    setTariffs((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
  }

  function handleDeleted(id: string) {
    setTariffs((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
  }

  async function addTariff() {
    setCreating(true);
    setTariffsError(null);
    try {
      const position = tariffs ? tariffs.length : 0;
      const created = await createAdminTariff({ ...NEW_TARIFF_INPUT, position });
      setTariffs((prev) => [...(prev ?? []), created]);
    } catch {
      setTariffsError('Не удалось создать тариф.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title="Тарифы" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[15px] font-semibold">Конструктор подписки</div>
            <Button size="sm" variant="secondary" onClick={addTariff} disabled={creating}>
              {creating ? 'Создаём…' : '+ Тариф'}
            </Button>
          </div>
          {tariffsError && <div className="text-negative">{tariffsError}</div>}
          {!tariffsError && !tariffs && <div className="text-body-secondary">Загрузка…</div>}
          {tariffs?.length === 0 && <div className="text-body-secondary">Тарифов пока нет.</div>}
          {tariffs?.map((t) => <TariffEditor key={t.id} tariff={t} allTariffs={tariffs} onSaved={handleSaved} onDeleted={handleDeleted} />)}
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 border-t border-border">
          <div className="text-[15px] font-semibold">Платежи</div>
          {error && <div className="text-negative">{error}</div>}
          {!error && !payments && <div className="text-body-secondary">Загрузка…</div>}
          {!error && payments && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
