import type { ReactNode } from 'react';

export function List({ children }: { children: ReactNode }) {
  return <div className="flex flex-col rounded-xl bg-surface overflow-hidden">{children}</div>;
}

export function ListItem({
  leading,
  headline,
  supporting,
  trailing,
  onClick,
}: {
  leading?: ReactNode;
  headline: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="list-item state-target" data-interactive={!!onClick} onClick={onClick} disabled={!onClick}>
      <span className="state-layer" />
      {leading ? <span className="flex-none text-on-surface-variant">{leading}</span> : null}
      <span className="flex-1 min-w-0 flex flex-col gap-1 text-left">
        <span className="text-base leading-6 truncate">{headline}</span>
        {supporting ? <span className="text-sm leading-5 text-on-surface-variant truncate">{supporting}</span> : null}
      </span>
      {trailing ? <span className="flex-none text-xs font-medium text-on-surface-variant">{trailing}</span> : null}
    </button>
  );
}
