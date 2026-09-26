import type { ApplyClassificationInput } from './chunkGroups';

export type ParseClassificationImportResult = { kind: 'ok'; input: ApplyClassificationInput } | { kind: 'error'; message: string };

const KEY_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** Validates the AI's pasted-back classification JSON before it's ever shown as a preview or applied — same spirit as dialogueImport.ts's validateDialogueShape. */
export function parseChunkClassificationImport(text: string, knownChunkIds: Set<string>, knownGroupKeys: Set<string>): ParseClassificationImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }

  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { newGroups?: unknown }).newGroups) || !Array.isArray((raw as { assignments?: unknown }).assignments)) {
    return { kind: 'error', message: 'Ожидается объект с полями newGroups и assignments (оба массивы).' };
  }
  const { newGroups, assignments } = raw as { newGroups: unknown[]; assignments: unknown[] };

  const proposedKeys = new Set<string>();
  for (const g of newGroups) {
    if (
      typeof g !== 'object' ||
      g === null ||
      typeof (g as { key?: unknown }).key !== 'string' ||
      typeof (g as { name?: unknown }).name !== 'string' ||
      !(g as { key: string }).key.trim() ||
      !(g as { name: string }).name.trim()
    ) {
      return { kind: 'error', message: 'У каждой новой группы должны быть непустые key и name.' };
    }
    const key = (g as { key: string }).key;
    if (!KEY_REGEX.test(key)) {
      return { kind: 'error', message: `Ключ группы "${key}" должен быть в формате snake_case (латиница, цифры, подчёркивания).` };
    }
    if (knownGroupKeys.has(key) || proposedKeys.has(key)) {
      return { kind: 'error', message: `Ключ группы "${key}" уже существует или повторяется в newGroups.` };
    }
    proposedKeys.add(key);
  }

  const allKnownKeys = new Set([...knownGroupKeys, ...proposedKeys]);
  const seenChunkIds = new Set<string>();
  for (const a of assignments) {
    if (typeof a !== 'object' || a === null || typeof (a as { chunkId?: unknown }).chunkId !== 'string' || !Array.isArray((a as { groupKeys?: unknown }).groupKeys)) {
      return { kind: 'error', message: 'У каждого назначения должны быть chunkId и groupKeys (массив).' };
    }
    const { chunkId, groupKeys } = a as { chunkId: string; groupKeys: unknown[] };
    if (!knownChunkIds.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${chunkId} не найден в библиотеке чанков.` };
    }
    if (seenChunkIds.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${chunkId} встречается в assignments дважды.` };
    }
    seenChunkIds.add(chunkId);
    for (const key of groupKeys) {
      if (typeof key !== 'string') {
        return { kind: 'error', message: `Все groupKeys для ${chunkId} должны быть строками.` };
      }
      if (!allKnownKeys.has(key)) {
        return { kind: 'error', message: `Группа с ключом "${key}" (для ${chunkId}) не найдена ни среди существующих, ни среди newGroups.` };
      }
    }
  }

  return {
    kind: 'ok',
    input: {
      newGroups: (newGroups as { key: string; name: string; description?: string | null }[]).map((g) => ({ key: g.key, name: g.name, description: g.description ?? null })),
      assignments: (assignments as { chunkId: string; groupKeys: string[] }[]).map((a) => ({ chunkId: a.chunkId, groupKeys: a.groupKeys })),
    },
  };
}
