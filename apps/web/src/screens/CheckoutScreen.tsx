import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCheckout, fetchTariffs, yearlySavingsPercent, CURRENCIES, type Currency, type Periodicity, type Tariff } from '../lib/payments';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/brand/Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERIODICITY_LABEL: Record<Periodicity, string> = { monthly: 'месяц', yearly: 'год' };
const PERIODICITY_BLURB: Record<Periodicity, string> = { monthly: 'без обязательств', yearly: 'выгоднее в пересчёте на месяц' };
const CURRENCY_PRICE_KEY: Record<Currency, 'priceUsd' | 'priceEur' | 'priceRub'> = { USD: 'priceUsd', EUR: 'priceEur', RUB: 'priceRub' };
const ALL_CURRENCIES: Currency[] = ['USD', 'EUR', 'RUB'];
// What every paid tariff unlocks — kept as a short fixed list rather than
// admin-editable freeform text, same three premium items PaywallScreen's own
// comparison shows. (Per-tariff entitlement differences, e.g. allowProgram,
// are visible once the account is actually gated by them, not spelled out here.)
const PREMIUM_FEATURES = ['Все темы и упражнения', 'Проверка открытых ответов и письма', 'Доп. уроки по слабым темам'];

function TopBar({ title, onBadgeClick }: { title?: string; onBadgeClick?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold">Chunki</span>
      </div>
      {title && (
        <button
          type="button"
          onClick={onBadgeClick}
          className="pressable flex items-center gap-1 rounded-full bg-surface-subtle pl-3 pr-2 py-1.5 text-[13px] font-medium"
        >
          {title}
          <ChevronRight size={14} className="text-text-tertiary" />
        </button>
      )}
    </div>
  );
}

function primaryPrice(tariff: Tariff): { symbol: string; amount: string } | null {
  for (const currency of ALL_CURRENCIES) {
    const amount = tariff[CURRENCY_PRICE_KEY[currency]];
    if (amount) return { symbol: CURRENCIES[currency].symbol, amount };
  }
  return null;
}

function TariffCard({ tariff, badge, onClick }: { tariff: Tariff; badge: string | null; onClick: () => void }) {
  const price = primaryPrice(tariff);
  return (
    <Card onClick={onClick} className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[19px] font-semibold">{tariff.name}</div>
        {badge && <span className="rounded-full bg-accent-subtle text-accent text-[12px] font-medium px-2.5 py-1 whitespace-nowrap">{badge}</span>}
      </div>
      {price ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[30px] font-bold leading-none">
            {price.symbol}
            {price.amount}
          </span>
          <span className="text-meta">/ {PERIODICITY_LABEL[tariff.periodicity]}</span>
        </div>
      ) : (
        <div className="text-meta">{PERIODICITY_BLURB[tariff.periodicity]}</div>
      )}
      <ul className="flex flex-col gap-2">
        {PREMIUM_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[14px]">
            <Check size={16} className="text-positive flex-none mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SummaryRow({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${onClick ? 'pressable text-left w-full flex items-center justify-between' : ''} px-4 py-3.5 border-b border-border last:border-b-0`}
    >
      <div className={onClick ? '' : 'flex flex-col gap-2'}>
        <div className="text-meta">{label}</div>
        {onClick ? <div className="text-[15px] font-medium mt-0.5">{children}</div> : children}
      </div>
      {onClick && <ChevronRight size={18} className="text-text-tertiary flex-none" />}
    </Comp>
  );
}

/** Checkout flow: pick a tariff card, then on one page pick currency, type an email, and hit "Оплатить" — nothing is picked automatically, unlike the old flow that took the plan/email from the store/account silently. Tariffs (name/prices/entitlements) come from the admin-managed subscription_tariffs config (see admin "Тарифы"), not a hardcoded guess. Only tariffs the admin actually priced are offered here — an unpriced tariff (e.g. the default free tier) isn't something you check out into. */
export function CheckoutScreen() {
  const { user, back } = useAppStore();
  const [allTariffs, setAllTariffs] = useState<Tariff[] | null>(null);
  const [tariffId, setTariffId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [email, setEmail] = useState(user?.email ?? '');
  const { checkingOut, checkoutError, subscribe } = useCheckout();

  useEffect(() => {
    fetchTariffs()
      .then(setAllTariffs)
      .catch(() => setAllTariffs([]));
  }, []);

  const purchasable = useMemo(() => (allTariffs ?? []).filter((t) => t.priceUsd || t.priceEur || t.priceRub), [allTariffs]);
  const tariff = purchasable.find((t) => t.id === tariffId) ?? null;

  // Smallest savings % across whichever currencies both periodicities are
  // priced in — see yearlySavingsPercent's own doc for why the minimum, not the max.
  const savingsPercent = useMemo(() => yearlySavingsPercent(purchasable), [purchasable]);
  const yearlyBadge = savingsPercent ? `Выгоднее на ~${Math.round(savingsPercent)}%` : null;
  const tariffBlurb = tariff?.periodicity === 'yearly' && yearlyBadge ? yearlyBadge : tariff ? PERIODICITY_BLURB[tariff.periodicity] : '';

  // Only offer a currency the admin actually priced this tariff in — falls
  // back to all three while tariffs haven't loaded yet or none are priced,
  // so checkout never gets blocked before prices are filled in.
  const availableCurrencies = useMemo<Currency[]>(() => {
    if (!tariff) return ALL_CURRENCIES;
    const priced = ALL_CURRENCIES.filter((c) => tariff[CURRENCY_PRICE_KEY[c]]);
    return priced.length > 0 ? priced : ALL_CURRENCIES;
  }, [tariff]);

  useEffect(() => {
    if (!availableCurrencies.includes(currency)) setCurrency(availableCurrencies[0]);
  }, [availableCurrencies, currency]);

  const emailValid = EMAIL_RE.test(email.trim());
  const price = tariff?.[CURRENCY_PRICE_KEY[currency]] ?? null;

  if (!tariff) {
    return (
      <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
        <TopBar />
        <div className="text-page-title">Выберите подписку</div>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-4">
          {purchasable.map((t) => (
            <TariffCard key={t.id} tariff={t} badge={t.periodicity === 'yearly' ? yearlyBadge : null} onClick={() => setTariffId(t.id)} />
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={back} className="w-full mt-auto">
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-6 anim-rise">
      <TopBar title={tariff.name} onBadgeClick={() => setTariffId(null)} />

      <div className="rounded-[var(--radius-lg)] bg-surface-subtle overflow-hidden">
        <SummaryRow label="Подписка" onClick={() => setTariffId(null)}>
          {tariff.name} · {tariffBlurb}
        </SummaryRow>
        <SummaryRow label="Валюта">
          <SegmentedControl
            options={availableCurrencies.map((c) => ({ value: c, label: `${CURRENCIES[c].symbol} ${c}` }))}
            value={currency}
            onChange={setCurrency}
          />
        </SummaryRow>
        <SummaryRow label="Email">
          <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        </SummaryRow>
      </div>

      <div className="text-meta">
        {price
          ? `Цена: ${CURRENCIES[currency].symbol}${price} ${currency}.`
          : 'Точную сумму покажет страница оплаты Lava.top на следующем шаге.'}{' '}
        На email придёт чек — можно указать другой, не только тот, что привязан к аккаунту.
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        {checkoutError && <div className="text-negative text-[13.5px] text-center">{checkoutError}</div>}
        <Button size="lg" onClick={() => subscribe(tariff.id, currency, email.trim())} disabled={checkingOut || !emailValid} className="w-full">
          {checkingOut ? 'Переходим к оплате…' : 'Оплатить'}
        </Button>
      </div>
    </div>
  );
}
