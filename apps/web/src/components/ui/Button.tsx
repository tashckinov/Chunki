import type { ReactNode } from 'react';

export function Button({
  variant,
  size,
  onClick,
  disabled,
  children,
  className = '',
}: {
  variant: 'filled' | 'tonal' | 'outlined' | 'text';
  size: 'xs' | 's' | 'm';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn state-target ${className}`}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="state-layer" />
      {children}
    </button>
  );
}
