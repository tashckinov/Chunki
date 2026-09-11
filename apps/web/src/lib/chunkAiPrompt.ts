// Shared by both prompt builders below, so this rule can never drift out of
// sync between them. Without explicit style guidance, an AI tends to write
// stiff, linguistic-register explanations ("выражает согласие с
// предложенным вариантом") that are harder for a learner to parse than the
// phrase being explained — the before/after examples here are the
// calibration target for what "simple" actually means.
const EXPLANATION_STYLE_GUIDE = `Как писать explanationRu и explanationEn (важное правило):
- Максимально просто — как будто объясняешь человеку с уровнем английского A1-A2.
- Не используй канцелярские/лингвистические формулировки: не "выражает согласие с предложенным вариантом", не "указывает на определённое обстоятельство", не "является решающим фактором" — и так далее в этом духе.
- Объясняй простой смысл именно этого куска именно в этом предложении, а не грамматическую функцию.
- Не обязательно переводить дословно — важнее просто и понятно объяснить, что это значит здесь.
- Одно короткое предложение, не длиннее. Если можно короче — делай короче.
- explanationRu — простое объяснение по-русски.
- explanationEn — то же самое простыми словами по-английски, лексика уровня A1-A2.

Пример того, как НЕ надо (слишком сложно и формально):
{ "text": "No worries,", "explanationRu": "Показывает, что просьба или проблема не доставляет неудобств.", "explanationEn": "Shows that the request or problem is not an inconvenience." }
{ "text": "depends on", "explanationRu": "Определяется каким-либо фактором.", "explanationEn": "Is determined by a particular factor." }

Пример того, как надо (просто и понятно):
{ "text": "No worries,", "explanationRu": "Здесь значит: «без проблем, всё нормально».", "explanationEn": "Here it means: \\"no problem, that's fine.\\"" }
{ "text": "depends on", "explanationRu": "Здесь значит: «зависит от».", "explanationEn": "Here it means: \\"changes because of something.\\"" }`;

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

${EXPLANATION_STYLE_GUIDE}

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
/**
 * Same idea as buildBulkSentencesRegeneratePrompt, but for the "Ситуация"
 * scenarios shown on the production-check screen — a separate copy/paste
 * round from both the sentences and dialogue bulk flows (confirmed with
 * the user), touching only chunk_situation_prompts/-parts.
 */
export function buildBulkSituationsRegeneratePrompt(chunks: { id: string; text: string; translation: string }[]): string {
  const chunkLines = chunks.map((c) => `- chunkId ${c.id}: "${c.text}" — "${c.translation}"`).join('\n');

  return `Ты помогаешь обновить ситуации для продакшн-проверки в приложении изучения английского языка — по 2-3 ситуации на каждый чанк ниже.

Каждая ситуация — короткое описание жизненной ситуации на английском (2-3 предложения, заканчивается вопросом вроде "What do you say?"), после прочтения которой пользователь должен естественно ответить, использовав фразу чанка.

Чанки (для каждого нужны 2-3 новые ситуации):
${chunkLines}

Для каждой ситуации укажи:
- text — сама ситуация на английском.
- parts — текст ситуации, разбитый по смыслу на 2-5 частей; части при склеивании через пробел должны в точности давать исходный текст text. Для каждой части:
  - text — сама часть (кусок текста ситуации).
  - explanationRu — объяснение значения этой части именно в этой ситуации, на русском.
  - explanationEn — то же объяснение на английском.

${EXPLANATION_STYLE_GUIDE}

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "situationsByChunk": [
    { "chunkId": "...", "situations": [ { "text": "...", "parts": [{ "text": "...", "explanationRu": "...", "explanationEn": "..." }] } ] }
  ]
}

Правила:
- Один объект в situationsByChunk на каждый чанк из списка выше (используй его chunkId как есть), 2-3 ситуации в situations.
- У каждой ситуации минимум 1 часть; части при склеивании через пробел восстанавливают исходный текст text.
- Не добавляй никаких полей, кроме перечисленных.`;
}

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

${EXPLANATION_STYLE_GUIDE}

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
