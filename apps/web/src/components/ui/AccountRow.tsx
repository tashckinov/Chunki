import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Input } from './Input';

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
export function AccountRow({ variant }: { variant: 'sidebar' | 'compact' }) {
  const { user, signOut } = useAppStore();
  const [signInOpen, setSignInOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSignInOpen(true)}
          className={`pressable w-full flex items-center gap-3 text-left ${
            variant === 'sidebar' ? 'rounded-[var(--radius-md)] px-3 py-2.5' : 'px-5 py-2'
          }`}
        >
          <div className="w-9 h-9 flex-none rounded-full bg-surface-subtle" />
          <span className="text-[14.5px] font-medium text-accent">Войти</span>
        </button>

        <Dialog open={signInOpen} onOpenChange={setSignInOpen} headline="Вход">
          <SignInForm onDone={() => setSignInOpen(false)} />
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setManageOpen(true)}
        className={`pressable w-full flex items-center gap-3 text-left ${
          variant === 'sidebar' ? 'rounded-[var(--radius-md)] px-3 py-2.5' : 'px-5 py-2'
        }`}
      >
        <Avatar name={user.name} />
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-medium truncate">{user.name}</span>
          {user.email && <span className="block text-meta truncate">{user.email}</span>}
        </span>
      </button>

      <Dialog open={manageOpen} onOpenChange={setManageOpen} headline={user.name}>
        <div className="flex flex-col gap-3">
          {user.email && <div className="text-body-secondary">{user.email}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setManageOpen(false)}>
              Закрыть
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                setManageOpen(false);
              }}
            >
              Выйти
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
