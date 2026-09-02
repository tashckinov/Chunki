import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export function ExerciseOption({
  selected,
  onClick,
  letter,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  letter?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable w-full flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3.5 text-left text-[15.5px] leading-[22px] transition-colors ${
        selected ? 'border-accent bg-accent-subtle text-text' : 'border-border text-text'
      }`}
    >
      {letter ? <span className={`flex-none text-[14px] font-medium w-4 ${selected ? 'text-accent' : 'text-text-secondary'}`}>{letter}</span> : null}
      <span className="flex-1">{children}</span>
      {selected ? <Check size={18} strokeWidth={2} className="flex-none text-accent" /> : null}
    </button>
  );
}
