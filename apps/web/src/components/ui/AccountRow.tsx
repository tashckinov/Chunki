import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { APP_VERSION } from '../../lib/version';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Input } from './Input';
import { SegmentedControl } from './SegmentedControl';
import { Icon } from './Icon';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="flex-none rounded-full bg-accent-subtle text-accent flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
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

function SignInForm({ onDone }: { onDone: () => void }) {
  const signIn = useAppStore((s) => s.signIn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <Input value={name} onChange={setName} placeholder="Имя" />
      <Input value={email} onChange={setEmail} placeholder="Email (необязательно)" type="email" />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Отмена
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={() => {
            signIn({ name: name.trim(), email: email.trim() });
            onDone();
          }}
        >
          Войти
        </Button>
      </div>
    </div>
  );
}

/**
 * There's no backend account system — this is a local display-name profile,
 * not real authentication, so it deliberately never asks for a password.
 */
function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, signOut } = useAppStore();

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} headline="Профиль">
        <div className="flex flex-col gap-5">
          <SignInForm onDone={() => onOpenChange(false)} />
          <div className="border-t border-border pt-4">
            <InterfaceModeSetting />
          </div>
          <div className="text-meta text-center">Chunki {APP_VERSION}</div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} headline={user.name}>
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
              signOut();
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
            <Avatar name={user.name} />
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-medium truncate">{user.name}</span>
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
          <div className="w-[23px] h-[23px] rounded-full bg-accent-subtle text-accent flex items-center justify-center text-[10px] font-semibold">
            {initials(user.name)}
          </div>
        ) : (
          <Icon name="Account" size={23} className={active ? 'text-accent' : 'text-text-tertiary'} />
        )}
        <span className={`w-full text-center truncate text-[11px] font-medium ${active ? 'text-accent' : 'text-text-tertiary'}`}>Профиль</span>
      </button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
