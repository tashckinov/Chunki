import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { APP_VERSION } from '../../lib/version';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';
import { Icon } from './Icon';

function displayNameOf(user: { displayName: string | null; email: string | null }): string {
  return user.displayName || user.email || 'Профиль';
}

function initials(user: { displayName: string | null; email: string | null }): string {
  const source = user.displayName || user.email || '';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Avatar({ user, size = 36 }: { user: { displayName: string | null; email: string | null; imageUrl: string | null }; size?: number }) {
  if (user.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="flex-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex-none rounded-full bg-accent-subtle text-accent flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(user)}
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

/**
 * No password/email-signup path here — Google OAuth is the only sign-in
 * method. The client never submits or overrides a profile picture: `imageUrl`
 * always comes back from the backend's /api/auth/me, sourced from Google's
 * verified profile at login time.
 */
function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, signIn, signOut, authError, dismissAuthError } = useAppStore();

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} headline="Профиль">
        <div className="flex flex-col gap-5">
          <button
            type="button"
            onClick={() => {
              dismissAuthError();
              signIn();
            }}
            className="pressable w-full flex items-center justify-center gap-2.5 rounded-[var(--radius-md)] border border-border px-4 py-3 text-[14.5px] font-medium"
          >
            <GoogleGlyph />
            Войти через Google
          </button>
          {authError && <div className="text-[13px] text-negative -mt-2">Не получилось войти. Попробуйте ещё раз.</div>}
          <div className="border-t border-border pt-4">
            <InterfaceModeSetting />
          </div>
          <div className="text-meta text-center">Chunki {APP_VERSION}</div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} headline={displayNameOf(user)}>
      <div className="flex flex-col gap-5">
        {user.email && <div className="text-body-secondary -mt-2">{user.email}</div>}
        <InterfaceModeSetting />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void signOut();
              onOpenChange(false);
            }}
          >
            Выйти
          </Button>
        </div>
        <div className="text-meta text-center">Chunki {APP_VERSION}</div>
      </div>
    </Dialog>
  );
}

export function AccountRow() {
  const user = useAppStore((s) => s.user);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pressable w-full flex items-center gap-3 text-left rounded-[var(--radius-md)] px-3 py-2.5">
        {user ? (
          <>
            <Avatar user={user} />
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-medium truncate">{displayNameOf(user)}</span>
              {user.email && <span className="block text-meta truncate">{user.email}</span>}
            </span>
          </>
        ) : (
          <>
            <div className="w-9 h-9 flex-none rounded-full bg-surface-subtle" />
            <span className="text-[14.5px] font-medium text-accent">Войти</span>
          </>
        )}
      </button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Bottom-nav tab trigger for mobile — same dialog, styled like the other tab buttons. */
export function AccountNavButton({ active }: { active: boolean }) {
  const user = useAppStore((s) => s.user);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pressable flex-1 min-w-0 basis-0 flex flex-col items-center justify-center gap-1 py-2.5 px-1">
        {user ? (
          <Avatar user={user} size={23} />
        ) : (
          <Icon name="Account" size={23} className={active ? 'text-accent' : 'text-text-tertiary'} />
        )}
        <span className={`w-full text-center truncate text-[11px] font-medium ${active ? 'text-accent' : 'text-text-tertiary'}`}>Профиль</span>
      </button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
