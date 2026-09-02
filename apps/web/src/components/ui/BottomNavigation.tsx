import { Icon, type IconName } from './Icon';
import { Logo } from '../brand/Logo';

export type NavItem = { label: string; icon: IconName } | { label: string; logo: true };

export function BottomNavigation({
  items,
  value,
  onChange,
}: {
  items: NavItem[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex-none flex items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map((item, i) => {
        const active = i === value;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onChange(i)}
            className="pressable flex-1 min-w-0 basis-0 flex flex-col items-center justify-center gap-1 py-2.5 px-1"
          >
            {'logo' in item ? <Logo size={23} /> : <Icon name={item.icon} size={23} className={active ? 'text-accent' : 'text-text-tertiary'} />}
            <span className={`w-full text-center truncate text-[11px] font-medium ${active ? 'text-accent' : 'text-text-tertiary'}`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
