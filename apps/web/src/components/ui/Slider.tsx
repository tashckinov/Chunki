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
  const pct = (value - min) / (max - min);
  return (
    <div className="slider">
      <div className="slider-track" />
      <div className="slider-active" style={{ width: `calc(${pct * 100}% + 2px)` }} />
      <div className="slider-handle" style={{ left: `calc(${pct * 100}% - 2px)` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Минут за занятие"
      />
    </div>
  );
}
