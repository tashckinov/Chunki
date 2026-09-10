import type { Character } from './characters';
import type { DialogueBuilderChunk } from '../screens/admin/DialogueBuilderView';
import { groupImagesByEmotion } from './characterEmotions';

/**
 * One self-contained instruction block an admin can paste into an external
 * AI chat: which chunk the dialogue is for, the full character library, and
 * every emotion image's id (+ description, when set) so the AI can pick a
 * specific character/emotion/image combination by id rather than guessing.
 */
export function buildDialogueAiPrompt(chunk: DialogueBuilderChunk, characters: Character[]): string {
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

  return `Ты помогаешь создать короткий диалог-комикс для приложения изучения английского языка.

Чанк (фраза, которую диалог должен естественно использовать):
"${chunk.text}" — "${chunk.translation}"

Библиотека персонажей (используй только эти id):
${characterBlocks.join('\n')}

Задача: придумай короткий диалог (2-6 реплик) между 1-3 персонажами из списка выше, в котором кто-то естественно использует фразу "${chunk.text}". У каждого персонажа в диалоге должна быть сторона экрана: "left" или "right".

Ответь СТРОГО валидным JSON, без markdown-обёртки и без каких-либо пояснений до или после, в точности в этом формате:
{
  "participants": [{ "characterId": "...", "side": "left" }],
  "messages": [{ "characterId": "...", "characterImageId": "...", "text": "..." }]
}

Правила:
- Каждый characterId, использованный в messages, обязательно должен присутствовать в participants.
- characterImageId обязательно должен принадлежать тому же персонажу, что указан в этом сообщении (смотри список изображений персонажа выше).
- side — только "left" или "right".
- Не добавляй никаких полей, кроме перечисленных.`;
}
