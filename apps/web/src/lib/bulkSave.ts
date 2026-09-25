import { useRef, useState } from 'react';

export interface BulkSaveSummary {
  okCount: number;
  total: number;
  failedChunkTexts: string[];
}

/**
 * Shared "iterate, save one at a time, track partial-failure retries"
 * loop behind the four bulk-AI-import sheets in ContentSection.tsx —
 * they differ only in what a "key" and a "save" mean for their item type.
 * `keyOf` identifies an item across retries (a chunkId, or an array index
 * for not-yet-created chunks); `saveAll` skips items whose key is already
 * in the retry set, so re-running after a partial failure only re-attempts
 * the ones that actually failed.
 */
export function useBulkSave<T, K>() {
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<BulkSaveSummary | null>(null);
  const savedKeysRef = useRef<Set<K>>(new Set());

  function reset() {
    setSaveSummary(null);
    savedKeysRef.current = new Set();
  }

  async function saveAll(items: T[], keyOf: (item: T, index: number) => K, saveOne: (item: T, index: number) => Promise<void>, labelOf: (item: T, index: number) => string) {
    setSaving(true);
    const failedChunkTexts: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const key = keyOf(items[i], i);
      if (savedKeysRef.current.has(key)) continue;
      try {
        await saveOne(items[i], i);
        savedKeysRef.current.add(key);
      } catch {
        failedChunkTexts.push(labelOf(items[i], i));
      }
    }
    setSaveSummary({ okCount: savedKeysRef.current.size, total: items.length, failedChunkTexts });
    setSaving(false);
  }

  return { saving, saveSummary, saveAll, reset };
}
