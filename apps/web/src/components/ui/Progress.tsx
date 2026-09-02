export function LinearProgress({ value }: { value: number }) {
  return (
    <div className="progress-linear">
      <div className="progress-linear-active" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function CircularProgress({ value, size = 96, thickness = 8 }: { value: number; size?: number; thickness?: number }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle className="progress-circular-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} />
      <circle
        className="progress-circular-active"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
