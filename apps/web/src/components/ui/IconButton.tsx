import { Icon, type IconName } from './Icon';

const SIZE: Record<'sm' | 'md', { box: string; icon: number }> = {
  sm: { box: 'w-9 h-9', icon: 20 },
  md: { box: 'w-11 h-11', icon: 22 },
};

export function IconButton({
  icon,
  label,
  size = 'md',
  tone = 'default',
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'accent' | 'muted';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const toneClass = tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-text-tertiary' : 'text-text';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`pressable inline-flex flex-none items-center justify-center rounded-full active:bg-surface-subtle disabled:opacity-40 ${SIZE[size].box} ${toneClass}`}
    >
      <Icon name={icon} size={SIZE[size].icon} />
    </button>
  );
}
