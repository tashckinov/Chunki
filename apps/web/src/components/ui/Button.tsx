import type { ReactNode } from 'react';

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-9 px-4 text-[14px] gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-[52px] px-6 text-[16px] gap-2',
};

const VARIANT: Record<'primary' | 'secondary' | 'ghost', string> = {
  primary: 'bg-accent text-on-accent active:bg-accent-strong disabled:bg-border-strong disabled:text-text-tertiary',
  secondary: 'bg-surface-subtle text-text active:bg-border disabled:text-text-tertiary',
  ghost: 'bg-transparent text-accent active:opacity-60 disabled:text-text-tertiary',
};

export function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  children,
  className = '',
}: {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors duration-150 disabled:cursor-default ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
