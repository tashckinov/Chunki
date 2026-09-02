import { Icon, type IconName } from './Icon';

export function NavigationBar({
  items,
  value,
  onChange,
}: {
  items: { label: string; icon: IconName }[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="navbar">
      {items.map((item, i) => (
        <button key={item.label} type="button" className="nav-item" data-selected={i === value} onClick={() => onChange(i)}>
          <span className="nav-item-indicator">
            <Icon name={item.icon} size={22} />
          </span>
          <span className="nav-item-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
