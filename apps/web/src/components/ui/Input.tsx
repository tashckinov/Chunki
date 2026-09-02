export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full box-border rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3 text-body outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent/30"
    />
  );
}
