import { useAppStore } from '../../store/appStore';
import { Icon } from './Icon';

export function displayNameOf(user: { displayName: string | null; email: string | null }): string {
  return user.displayName || user.email || 'Профиль';
}

function initials(user: { displayName: string | null; email: string | null }): string {
  const source = user.displayName || user.email || '';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AccountAvatar({ user, size = 36 }: { user: { displayName: string | null; email: string | null; imageUrl: string | null }; size?: number }) {
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
      aria-hidden="true"
      className="flex-none rounded-full bg-accent-subtle text-accent flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(user)}
    </div>
  );
}

export function PremiumBadge() {
  return (
    <span className="inline-flex shrink-0 rounded-full border border-accent bg-accent-subtle px-2 py-0.5 text-[11px] font-medium text-accent">
      Premium
    </span>
  );
}

export function AccountRow({ active, compact, onClick }: { active: boolean; compact: boolean; onClick: () => void }) {
  const user = useAppStore((s) => s.user);
  const isPremium = useAppStore((s) => s.isPremium);
  if (!user) return null;

  return (
    <button
      type="button"
      aria-label="Личный кабинет"
      aria-current={active ? 'page' : undefined}
      title={compact ? 'Личный кабинет' : undefined}
      onClick={onClick}
      className={`pressable flex w-full items-center gap-3 rounded-[var(--radius-md)] py-2.5 text-left ${compact ? 'justify-center' : 'px-3'} ${active ? 'bg-accent-subtle' : ''}`}
    >
      <AccountAvatar user={user} />
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{displayNameOf(user)}</span>
          {user.email && <span className="block truncate text-meta">{user.email}</span>}
          {isPremium && <span className="mt-1 block"><PremiumBadge /></span>}
        </span>
      )}
    </button>
  );
}

export function AccountNavButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const user = useAppStore((s) => s.user);
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick}
      className="pressable flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-1 py-2.5">
      {user ? <AccountAvatar user={user} size={23} /> : (
        <Icon name="Account" size={23} className={active ? 'text-accent' : 'text-text-tertiary'} />
      )}
      <span className={`w-full truncate text-center text-[11px] font-medium ${active ? 'text-accent' : 'text-text-tertiary'}`}>Профиль</span>
    </button>
  );
}
