import { CARDS } from '@app/shared';
import type { ChunkCard } from '@app/shared';

/** Cards for the active deck run — a specific deck's subset, or every card. */
export function activeCards(cardIds: string[] | null): ChunkCard[] {
  if (!cardIds) return CARDS;
  const set = new Set(cardIds);
  return CARDS.filter((c) => set.has(c.id));
}
