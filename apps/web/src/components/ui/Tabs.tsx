import { Tabs as BaseTabs } from '@base-ui/react/tabs';

export function Tabs({ items, value, onChange }: { items: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onChange(v as number)}>
      <BaseTabs.List className="pv-tabs-list">
        {items.map((label, i) => (
          <BaseTabs.Tab key={label} value={i} className="pv-tab">
            {label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="pv-tab-indicator" />
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}
