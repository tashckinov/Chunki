import type { ReactNode } from 'react';

/** Wraps the first case-insensitive occurrence of targetText inside text with a restrained highlight — used to show where a dialogue message actually uses the chunk it's built around. */
export function highlightTarget(text: string, targetText?: string | null): ReactNode {
  if (!targetText) return text;
  const idx = text.toLowerCase().indexOf(targetText.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-subtle text-inherit rounded px-0.5">{text.slice(idx, idx + targetText.length)}</mark>
      {text.slice(idx + targetText.length)}
    </>
  );
}
