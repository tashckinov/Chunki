import type { AdminChunkGroup, AdminChunkWithGroups } from './chunkGroups';

/**
 * One self-contained instruction block an admin can paste into an external
 * AI chat — same copy/paste pattern as lib/chunkAiPrompt.ts. Exports the
 * whole chunk library + its current group classification + the existing
 * group catalog, and asks the AI to propose corrections: which chunks
 * should move to which group(s), and which brand-new groups (if any) are
 * needed for phrases that don't fit an existing one. See
 * lib/chunkGroupImport.ts for parsing the pasted-back result, and
 * ChunkGroupsSection.tsx for the review-then-apply UI around this.
 */
export function buildChunkClassificationPrompt(chunks: AdminChunkWithGroups[], groups: AdminChunkGroup[]): string {
  const groupLines = groups.length
    ? groups.map((g) => `- key "${g.key}": "${g.name}"${g.description ? ` — ${g.description}` : ''}`).join('\n')
    : '(групп пока нет)';

  const groupByKeyId = new Map(groups.map((g) => [g.id, g.key]));
  const chunkLines = chunks
    .map((c) => {
      const currentKeys = c.groupIds.map((id) => groupByKeyId.get(id)).filter(Boolean);
      const currentLabel = currentKeys.length ? currentKeys.join(', ') : 'без группы';
      return `- chunkId ${c.id}: "${c.text}" — "${c.translation}" (сейчас: ${currentLabel})`;
    })
    .join('\n');

  return `Ты помогаешь классифицировать чанки (короткие устойчивые фразы) приложения для изучения английского по смысловым группам — например accepting_suggestion объединяет "sounds good", "I'm in", "let's do it", "that works for me" и подобные фразы, выражающие согласие с предложением.

Смысл этой классификации: когда пользователь отвечает на ситуацию свободным текстом, приложение проверяет не только исходную фразу, под которую была написана ситуация, но и любую другую фразу из той же смысловой группы — если она тоже подходит по смыслу, ответ засчитывается.

Существующие группы:
${groupLines}

Все чанки библиотеки с их текущей классификацией:
${chunkLines}

Задача:
1. Для каждого чанка реши, к какой существующей группе (или группам) он на самом деле относится по смыслу.
2. Если для какого-то чанка (или нескольких похожих чанков) нет подходящей существующей группы — придумай новую группу: короткий key на английском в snake_case (например accepting_suggestion), понятное name на русском, короткое description на русском объясняющее, что объединяет эту группу.
3. В ответ включай запись про чанк в assignments ТОЛЬКО если его классификация должна измениться (новый набор групп отличается от текущего) — не повторяй чанки, у которых классификация уже верна.
4. У чанка может быть несколько групп, если он подходит под разные смысловые категории.

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "newGroups": [
    { "key": "...", "name": "...", "description": "..." }
  ],
  "assignments": [
    { "chunkId": "...", "groupKeys": ["...", "..."] }
  ]
}

Правила:
- groupKeys в assignments — это key существующих групп (см. список выше) и/или key групп, которые ты сам предложил в newGroups.
- Не добавляй никаких полей, кроме перечисленных.
- Если у чанка по итогу нет ни одной подходящей группы, всё равно можно не включать его в assignments (это то же самое, что "без группы").`;
}
