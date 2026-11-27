import type { ReactNode } from 'react';

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'min-h-9 px-4 text-[0.875rem] gap-1.5',
  md: 'min-h-11 px-5 text-[0.9375rem] gap-2',
  lg: 'min-h-13 px-6 text-base gap-2',
};

const VARIANT: Record<'primary' | 'secondary' | 'ghost', string> = {
  primary: 'bg-accent text-on-accent active:bg-accent-strong disabled:bg-border-strong disabled:text-text-tertiary',
  secondary: 'bg-surface-subtle text-text active:bg-border disabled:text-text-tertiary',
  ghost: 'bg-transparent text-accent active:opacity-60 disabled:text-text-tertiary',
};

export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  children,
  className = '',
  "aria-pressed": ariaPressed,
}: {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  "aria-pressed"?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={ariaPressed}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-[var(--radius-md)] py-2 text-center font-medium leading-tight transition-colors duration-150 disabled:cursor-default ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
