import type { ReactNode } from 'react';

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  divider = true,
  muted = false,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
  muted?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${onClick ? 'pressable cursor-pointer' : ''} w-full flex items-center gap-3 py-3.5 text-left ${divider ? 'border-b border-border last:border-b-0' : ''}`}
    >
      {leading ? <span className="flex-none text-text-secondary">{leading}</span> : null}
      <span className="flex-1 min-w-0">
        <span className={`block text-[15.5px] leading-[22px] truncate ${muted ? 'text-text-secondary' : 'text-text'}`}>{title}</span>
        {subtitle ? <span className="block text-meta mt-0.5 truncate">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="flex-none text-[13px] font-medium text-text-secondary">{trailing}</span> : null}
    </Comp>
  );
}
