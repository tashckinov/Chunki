import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { APP_VERSION } from '../lib/version';
import { Button } from '../components/ui/Button';
import { NavigationBar } from '../components/ui/NavigationBar';
import { AccountAvatar, displayNameOf, PremiumBadge } from '../components/ui/AccountRow';
import { TimecodeSetting } from '../components/ui/TimecodeSetting';
import { StudyReminderSetting } from '../components/ui/StudyReminderSetting';
import { StudyGoalForm } from '../components/ui/StudyGoalForm';
import { SegmentedControl } from '../components/ui/SegmentedControl';

function StudyGoalSetting() {
  const goal = useAppStore((s) => s.studyGoal?.dailyCardGoal);
  const [editing, setEditing] = useState(false);
  if (!goal) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium">Цель по карточкам</div>
          <div className="text-meta">{goal} в день · до {goal} за сессию</div>
        </div>
        {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Изменить</Button>}
      </div>
      {editing && <StudyGoalForm currentGoal={goal} onClose={() => setEditing(false)} />}
    </div>
  );
}

function InterfaceModeSetting() {
  const { interfaceMode, setInterfaceMode } = useAppStore();
  return (
    <div>
      <div className="text-[14px] font-medium mb-2">Язык карточек</div>
      <SegmentedControl
        options={[
          { value: 'ru-en' as const, label: 'Ru → En' },
          { value: 'en-en' as const, label: 'En → En' },
        ]}
        value={interfaceMode}
        onChange={setInterfaceMode}
      />
      <div className="text-meta mt-2">
        {interfaceMode === 'ru-en'
          ? 'На обороте карточки — перевод и пример.'
          : 'Только английский: перевод скрыт, остаётся пример.'}
      </div>
    </div>
  );
}

/** Premium status + upsell, shown in the profile for a logged-in user — "Подписка до <дата>" once active, otherwise a link into the checkout stepper (same entry point as Paywall/DeckDoneScreen). */
function SubscriptionStatus({ onNavigate }: { onNavigate: () => void }) {
  const { isPremium, premiumUntil } = useAppStore();

  if (isPremium && premiumUntil) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3 text-[14px] font-medium">
        <span>Подписка до {new Date(premiumUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <PremiumBadge />
      </div>
    );
  }

  return (
    <Button size="sm" onClick={onNavigate} className="w-full">
      Оформить подписку
    </Button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.96H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.04z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.96l2.97 2.34C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

const PANEL = 'flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 min-[768px]:p-5';

function SignInPanel() {
  const { signIn, authError, dismissAuthError, signInWithPasskey, passkeyBusy, passkeyError, dismissPasskeyError } = useAppStore();
  return (
    <section aria-labelledby="sign-in-heading" className={PANEL}>
      <h1 id="sign-in-heading" className="text-section-title">Войти в Chunki</h1>
      <div className="flex flex-col gap-2.5">
        <Button variant="secondary" onClick={() => { dismissAuthError(); signIn(); }}>
          <GoogleGlyph />
          Войти через Google
        </Button>
        <Button variant="secondary" disabled={passkeyBusy} onClick={() => { dismissPasskeyError(); void signInWithPasskey('login'); }}>
          <KeyRound size={18} aria-hidden="true" />
          Войти через Passkey
        </Button>
      </div>
      <Button variant="ghost" disabled={passkeyBusy} onClick={() => { dismissAuthError(); void signInWithPasskey('register'); }}>
        Создать аккаунт через Passkey
      </Button>
      {passkeyBusy && <p role="status" className="text-meta">Подключаем Passkey…</p>}
      {authError && <p role="alert" className="text-negative">Не получилось войти. Попробуйте ещё раз.</p>}
      {passkeyError && <p role="alert" className="text-negative">{passkeyError}</p>}
    </section>
  );
}

export function ProfileScreen() {
  const { user, back, go, signOut } = useAppStore();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar title="Личный кабинет" onBack={back} />
      <div className="scroll-clean min-h-0 flex-1 px-5 pt-3 pb-8">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
          {user ? (
            <>
              <header className="flex items-center gap-4 py-3">
                <AccountAvatar user={user} size={64} />
                <div className="min-w-0">
                  <h1 className="text-page-title wrap-anywhere">{displayNameOf(user)}</h1>
                  {user.email && user.email !== displayNameOf(user) && <p className="mt-1 wrap-anywhere text-body-secondary">{user.email}</p>}
                </div>
              </header>
              <section aria-labelledby="subscription-heading" className={PANEL}>
                <h2 id="subscription-heading" className="text-section-title">Подписка</h2>
                <SubscriptionStatus onNavigate={() => go('checkout')} />
                <TimecodeSetting key={user.id} />
              </section>
              <section aria-labelledby="study-settings-heading" className={PANEL}>
                <h2 id="study-settings-heading" className="text-section-title">Настройки обучения</h2>
                <InterfaceModeSetting />
                <StudyGoalSetting />
                <StudyReminderSetting />
              </section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-meta">Chunki · сборка {APP_VERSION}</p>
                <div className="flex gap-2">
                  {user.isAdmin && <Button size="sm" variant="secondary" onClick={() => go('admin')}>Админка</Button>}
                  <Button size="sm" variant="ghost" onClick={() => void signOut()}>Выйти</Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <SignInPanel />
              <section aria-label="Язык карточек" className={PANEL}><InterfaceModeSetting /></section>
              <p className="text-meta">Chunki · сборка {APP_VERSION}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
