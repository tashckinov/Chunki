import { Icon, type IconName } from './Icon';

export function IconButton({
  icon,
  label,
  size = 's',
  variant = 'standard',
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  size?: 's' | 'm';
  variant?: 'standard' | 'filled' | 'tonal';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-btn state-target"
      data-size={size}
      data-variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="state-layer" />
      <Icon name={icon} />
    </button>
  );
}
