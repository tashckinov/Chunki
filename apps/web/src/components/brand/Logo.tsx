import { useId } from 'react';

/**
 * Chunki mark — three speech-bubble "chunks" (a wide one on top, a tailed one
 * and a plain one below). Kept as inline SVG so it stays crisp at any size.
 * Gradient ids are instance-scoped (useId) since multiple copies can be
 * mounted at once (desktop sidebar + mobile header) — duplicate SVG ids
 * would make every copy but the first resolve to an invisible fill.
 */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const uid = useId();
  const top = `${uid}-top`;
  const teal = `${uid}-teal`;
  const coral = `${uid}-coral`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 92" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={top} x1="4" y1="4" x2="96" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3AA7F5" />
          <stop offset="1" stopColor="#4436E8" />
        </linearGradient>
        <linearGradient id={teal} x1="4" y1="52" x2="46" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#13D9A3" />
          <stop offset="1" stopColor="#2599E9" />
        </linearGradient>
        <linearGradient id={coral} x1="52" y1="52" x2="96" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF9C6B" />
          <stop offset="1" stopColor="#F03348" />
        </linearGradient>
      </defs>

      <path d="M58 44 C 58.5 49, 56.5 53.5, 53 61 C 61.5 56, 67 50.5, 68.5 44 Z" fill={`url(#${top})`} />
      <rect x="4" y="4" width="92" height="44" rx="22" fill={`url(#${top})`} />

      <path d="M12 88 C 11 90.5, 13 92, 15.3 90.7 L 24 84 L 12 84 Z" fill={`url(#${teal})`} />
      <rect x="4" y="52" width="42" height="40" rx="16" fill={`url(#${teal})`} />

      <rect x="54" y="52" width="42" height="40" rx="16" fill={`url(#${coral})`} />
    </svg>
  );
}
