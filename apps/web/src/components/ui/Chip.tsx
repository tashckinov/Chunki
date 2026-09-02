import type { ReactNode } from 'react';

/**
 * Reserved for tags, filters, statuses and compact single/multi-select
 * options (CEFR level, day-of-week, reminder time) — not for general
 * navigation or primary actions.
 */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors ${
        selected ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-text'
      }`}
    >
      {children}
    </button>
  );
}
