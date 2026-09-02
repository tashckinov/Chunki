export function Tabs({ items, value, onChange }: { items: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="tabs">
      {items.map((label, i) => (
        <button key={label} type="button" className="tab" data-selected={i === value} onClick={() => onChange(i)}>
          {label}
          {i === value ? <span className="tab-indicator" /> : null}
        </button>
      ))}
    </div>
  );
}
