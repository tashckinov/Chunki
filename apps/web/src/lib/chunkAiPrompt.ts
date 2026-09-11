/**
 * One self-contained instruction block an admin can paste into an external
 * AI chat: asks for `count` brand-new chunks for a collection, each with
 * ~3 example sentences broken into contextual, explainable parts. Mirrors
 * dialogueAiPrompt.ts's shape exactly.
 */
export function buildBulkChunkCreatePrompt(collectionTitle: string, level: string, count: number, existingChunkTexts: string[]): string {
  const existingBlock = existingChunkTexts.length
    ? `\n\nУже есть в этой коллекции (не повторяй эти фразы):\n${existingChunkTexts.map((t) => `- ${t}`).join('\n')}`
    : '';

  return `Ты помогаешь наполнить коллекцию для приложения изучения английского языка чанками — короткими устойчивыми фразами/коллокациями.

Коллекция: "${collectionTitle}", уровень ${level}.${existingBlock}

Задача: придумай ${count} новых английских чанков подходящего уровня для этой коллекции. Для каждого чанка укажи:
- text — сам чанк на английском (короткая устойчивая фраза, не отдельное слово).
- translation — перевод на русский.
- explanation — короткое объяснение значения и употребления, на русском.
- level — уровень CEFR (например "${level}").
- situationPrompts (необязательно) — 1 короткая ситуация на английском для устной/письменной практики использования этого чанка.
- sentences — ровно 3 примера предложения с этим чанком. Для каждого предложения:
  - text — само предложение на английском.
  - translation — перевод предложения на русский.
  - parts — предложение, разбитое по смыслу на 2-4 части; части при склеивании через пробел должны в точности давать исходное предложение text. Для каждой части:
    - text — сама часть (кусок предложения).
    - explanationRu — объяснение значения этой части именно в этом предложении, на русском.
    - explanationEn — то же объяснение на английском.

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "chunks": [
    {
      "text": "...", "translation": "...", "explanation": "...", "level": "...",
      "situationPrompts": ["..."],
      "sentences": [
        { "text": "...", "translation": "...", "parts": [{ "text": "...", "explanationRu": "...", "explanationEn": "..." }] }
      ]
    }
  ]
}

Правила:
- Ровно ${count} объектов в chunks.
- У каждого чанка ровно 3 объекта в sentences.
- У каждого предложения минимум 1 часть; части в порядке слева направо, при склеивании через пробел восстанавливают исходное предложение text.
- Не повторяй чанки, которые уже есть в коллекции (см. список выше).
- Не добавляй никаких полей, кроме перечисленных.`;
}

/**
 * Same idea, but for regenerating the example sentences of chunks that
 * already exist — a separate copy/paste round from the dialogue-bulk
 * feature, touching only sentences/parts, never dialogues.
 */
export function buildBulkSentencesRegeneratePrompt(chunks: { id: string; text: string; translation: string }[]): string {
  const chunkLines = chunks.map((c) => `- chunkId ${c.id}: "${c.text}" — "${c.translation}"`).join('\n');

  return `Ты помогаешь обновить примеры предложений для чанков в приложении изучения английского языка — по 3 предложения на каждый чанк ниже.

Чанки (для каждого нужны ровно 3 новых примера предложения, естественно использующих именно его фразу):
${chunkLines}

Для каждого предложения укажи:
- text — само предложение на английском.
- translation — перевод предложения на русский.
- parts — предложение, разбитое по смыслу на 2-4 части; части при склеивании через пробел должны в точности давать исходное предложение text. Для каждой части:
  - text — сама часть (кусок предложения).
  - explanationRu — объяснение значения этой части именно в этом предложении, на русском.
  - explanationEn — то же объяснение на английском.

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "sentencesByChunk": [
    { "chunkId": "...", "sentences": [ { "text": "...", "translation": "...", "parts": [{ "text": "...", "explanationRu": "...", "explanationEn": "..." }] } ] }
  ]
}

Правила:
- Один объект в sentencesByChunk на каждый чанк из списка выше (используй его chunkId как есть), ровно 3 предложения в sentences.
- У каждого предложения минимум 1 часть; части при склеивании через пробел восстанавливают исходное предложение text.
- Не добавляй никаких полей, кроме перечисленных.`;
}
