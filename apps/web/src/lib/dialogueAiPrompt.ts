import type { Character } from './characters';
import type { DialogueKind } from './dialogues';
import type { DialogueBuilderChunk } from '../screens/admin/DialogueBuilderView';
import { groupImagesByEmotion } from './characterEmotions';

/** The character-library portion shared by both the single-chunk and bulk prompts: every emotion image's id (+ description, when set) so the AI can pick a specific combination by id rather than guessing. */
export function buildCharacterLibraryBlock(characters: Character[]): string {
  const characterBlocks = characters.map((c) => {
    if (c.images.length === 0) {
      return `- ${c.name} (characterId: ${c.id}) — нет загруженных эмоций, использовать нельзя.`;
    }
    const groups = groupImagesByEmotion(c.images);
    const lines = groups.flatMap(([emotion, images]) => {
      const described = images.filter((i) => i.description);
      const undescribed = images.filter((i) => !i.description);
      const describedLines = described.map((i) => `    - ${emotion}: imageId ${i.id} — описание: "${i.description}"`);
      const undescribedLines =
        undescribed.length === 0
          ? []
          : undescribed.length === 1
            ? [`    - ${emotion}: imageId ${undescribed[0].id} — без описания`]
            : [`    - ${emotion}: любое из [${undescribed.map((i) => i.id).join(', ')}] — без описания, все равнозначны, выбери любое`];
      return [...describedLines, ...undescribedLines];
    });
    return `- ${c.name} (characterId: ${c.id})\n${lines.join('\n')}`;
  });
  return characterBlocks.join('\n');
}

/**
 * The extra instruction block for kind='situation' — this comic is shown in
 * "Ситуация" (production-check), where the learner writes the last line
 * themselves instead of reading it, so the AI must mark exactly that message.
 */
const SITUATION_BLANK_INSTRUCTIONS = `

Это особый вид комикса — для режима "Ситуация": учащийся НЕ читает последнюю реплику, а дописывает её сам за персонажа. Поэтому:
- Ровно одна реплика — последняя в диалоге — должна иметь поле "isBlank": true. Это реплика, где фраза чанка употребляется наиболее естественно.
- Придумай для неё текст как обычно (это модельный ответ, который учащийся увидит только после того, как попробует сам) — просто пометь её isBlank.
- У остальных реплик поле isBlank указывать не нужно (или false).`;

const SITUATION_MESSAGE_FIELD_HINT = ', "isBlank": false';

/**
 * One self-contained instruction block an admin can paste into an external
 * AI chat: which chunk the dialogue is for, the full character library, and
 * every emotion image's id (+ description, when set) so the AI can pick a
 * specific character/emotion/image combination by id rather than guessing.
 */
export function buildDialogueAiPrompt(chunk: DialogueBuilderChunk, characters: Character[], kind: DialogueKind): string {
  return `Ты помогаешь создать короткий диалог-комикс для приложения изучения английского языка.

Чанк (фраза, которую диалог должен естественно использовать):
"${chunk.text}" — "${chunk.translation}"

Библиотека персонажей (используй только эти id):
${buildCharacterLibraryBlock(characters)}

Задача: придумай короткий диалог (2-6 реплик) между 1-3 персонажами из списка выше, в котором кто-то естественно использует фразу "${chunk.text}". У каждого персонажа в диалоге должна быть сторона экрана: "left" или "right".${kind === 'situation' ? SITUATION_BLANK_INSTRUCTIONS : ''}

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "participants": [{ "characterId": "...", "side": "left" }],
  "messages": [{ "characterId": "...", "characterImageId": "...", "text": "..."${kind === 'situation' ? SITUATION_MESSAGE_FIELD_HINT : ''} }]
}

Правила:
- Каждый characterId, использованный в messages, обязательно должен присутствовать в participants.
- characterImageId обязательно должен принадлежать тому же персонажу, что указан в этом сообщении (смотри список изображений персонажа выше).
- side — только "left" или "right".
- Не добавляй никаких полей, кроме перечисленных.`;
}

/**
 * Same idea as buildDialogueAiPrompt, but for an entire collection at once —
 * one dialogue per chunk, in a single copy/paste round trip. Lets an admin
 * redo every chunk's comic with a newly-expanded cast without repeating the
 * copy/paste cycle chunk by chunk.
 */
export function buildBulkDialogueAiPrompt(chunks: DialogueBuilderChunk[], characters: Character[], kind: DialogueKind): string {
  const chunkLines = chunks.map((c) => `- chunkId ${c.id}: "${c.text}" — "${c.translation}"`).join('\n');

  return `Ты помогаешь создать короткие диалоги-комиксы для приложения изучения английского языка — по одному диалогу на каждый чанк ниже.

Чанки (для каждого нужен отдельный диалог, использующий именно его фразу):
${chunkLines}

Библиотека персонажей (используй только эти id):
${buildCharacterLibraryBlock(characters)}

Задача: для каждого чанка придумай короткий диалог (2-6 реплик) между 1-3 персонажами из списка выше, в котором кто-то естественно использует фразу этого чанка. У каждого персонажа в диалоге должна быть сторона экрана: "left" или "right". Можно свободно переиспользовать одних и тех же персонажей в разных чанках.${kind === 'situation' ? SITUATION_BLANK_INSTRUCTIONS : ''}

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "dialogues": [
    { "chunkId": "...", "participants": [{ "characterId": "...", "side": "left" }], "messages": [{ "characterId": "...", "characterImageId": "...", "text": "..."${kind === 'situation' ? SITUATION_MESSAGE_FIELD_HINT : ''} }] }
  ]
}

Правила:
- Один объект в dialogues на каждый чанк из списка выше (используй его chunkId как есть).
- Каждый characterId, использованный в messages, обязательно должен присутствовать в participants этого же диалога.
- characterImageId обязательно должен принадлежать тому же персонажу, что указан в этом сообщении.
- side — только "left" или "right".
- Не добавляй никаких полей, кроме перечисленных.`;
}
