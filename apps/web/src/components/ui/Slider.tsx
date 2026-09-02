import { Slider as BaseSlider } from '@base-ui/react/slider';

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <BaseSlider.Root value={value} min={min} max={max} step={step} onValueChange={(v) => onChange(v as number)}>
      <BaseSlider.Control className="pv-slider-root">
        <BaseSlider.Track className="pv-slider-track">
          <BaseSlider.Indicator className="pv-slider-indicator" />
          <BaseSlider.Thumb className="pv-slider-thumb" aria-label="Минут за занятие" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
