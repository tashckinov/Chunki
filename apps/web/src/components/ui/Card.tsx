import type { ReactNode } from 'react';

/**
 * Use sparingly — only where grouping content in a distinct surface genuinely
 * helps comprehension (a hero CTA, a callout). Most sections should just be
 * whitespace + typography, not a card.
 */
export function Card({
  variant = 'surface',
  onClick,
  className = '',
  children,
}: {
  variant?: 'surface' | 'subtle' | 'accent';
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const bg = variant === 'accent' ? 'bg-accent-subtle' : variant === 'subtle' ? 'bg-surface-subtle' : 'bg-surface';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${onClick ? 'pressable text-left w-full' : ''} rounded-[var(--radius-lg)] ${bg} ${className}`}
    >
      {children}
    </Comp>
  );
}
