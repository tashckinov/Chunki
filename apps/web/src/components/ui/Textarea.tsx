export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full box-border rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3.5 text-body resize-none outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent/30"
    />
  );
}
