import { Icon, type IconName } from './Icon';

export function BottomNavigation({
  items,
  value,
  onChange,
}: {
  items: { label: string; icon: IconName }[];
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
            className="pressable flex-1 flex flex-col items-center justify-center gap-1 py-2.5"
          >
            <Icon name={item.icon} size={23} className={active ? 'text-accent' : 'text-text-tertiary'} />
            <span className={`text-[11px] font-medium ${active ? 'text-accent' : 'text-text-tertiary'}`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
