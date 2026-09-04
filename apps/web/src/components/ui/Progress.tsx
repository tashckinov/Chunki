export function LinearProgress({ value }: { value: number }) {
  return (
    <div className="h-1 w-full rounded-full bg-surface-subtle overflow-hidden">
      <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** A ring split into discrete arcs, filled left-to-right — how well a single chunk is learned. */
export function SegmentedRing({
  segments,
  filled,
  size = 20,
  thickness = 3,
  gapDegrees = 18,
}: {
  segments: number;
  filled: number;
  size?: number;
  thickness?: number;
  gapDegrees?: number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentAngle = 360 / segments;
  const arcLength = (Math.max(0, segmentAngle - gapDegrees) / 360) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {Array.from({ length: segments }, (_, i) => (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          className={i < filled ? 'stroke-accent transition-[stroke] duration-200' : 'stroke-surface-subtle'}
          style={{ transform: `rotate(${i * segmentAngle - 90}deg)`, transformOrigin: '50% 50%' }}
        />
      ))}
    </svg>
  );
}

export function CircularProgress({ value, size = 96, thickness = 7 }: { value: number; size?: number; thickness?: number }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} className="stroke-surface-subtle" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-accent transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}
