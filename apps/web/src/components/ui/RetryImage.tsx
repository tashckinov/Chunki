import { useEffect, useState } from 'react';

const FAST_RETRIES = 3;
const FAST_BASE_DELAY_MS = 400;
const SLOW_RETRY_DELAY_MS = 8000;
const MAX_ATTEMPTS = 20; // a handful of fast retries, then slow retries for a few minutes before giving up

/**
 * A plain <img> never retries a failed load on its own — one dropped packet
 * on a flaky mobile connection leaves the user staring at a half-rendered
 * (or fully broken) image forever, with nothing to do about it. This is a
 * drop-in replacement that changes `src` to retry a few times with backoff,
 * then keeps retrying slowly in the background, hiding the ugly native
 * broken-image glyph while a retry is pending. It also shows a pulsing
 * skeleton fill before the first successful load, instead of a blank box.
 */
export function RetryImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setBroken(false);
    setLoaded(false);
  }, [src]);

  function handleError() {
    setBroken(true);
    if (attempt >= MAX_ATTEMPTS) return;
    const delay = attempt < FAST_RETRIES ? FAST_BASE_DELAY_MS * 2 ** attempt : SLOW_RETRY_DELAY_MS;
    setTimeout(() => setAttempt((a) => a + 1), delay);
  }

  // Cache-busting only on a retry — the first attempt should hit the normal browser cache.
  const resolvedSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;
  const skeleton = !loaded && !broken;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={`${className ?? ''} ${skeleton ? 'animate-pulse bg-surface-subtle' : ''}`}
      style={broken ? { visibility: 'hidden' } : undefined}
      loading="lazy"
      decoding="async"
      onError={handleError}
      onLoad={() => {
        setBroken(false);
        setLoaded(true);
      }}
    />
  );
}
