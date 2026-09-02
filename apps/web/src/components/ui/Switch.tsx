import { Switch as BaseSwitch } from '@base-ui/react/switch';

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <BaseSwitch.Root checked={checked} onCheckedChange={onChange} className="pv-switch-root">
      <BaseSwitch.Thumb className="pv-switch-thumb" />
    </BaseSwitch.Root>
  );
}
