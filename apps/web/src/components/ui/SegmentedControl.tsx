export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const widthPct = 100 / options.length;

  return (
    <div className="pv-segmented">
      <div className="pv-segmented-thumb" style={{ left: `calc(${index * widthPct}% + 3px)`, width: `calc(${widthPct}% - 6px)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" className="pv-segmented-item" data-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
