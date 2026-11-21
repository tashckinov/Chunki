import { useEffect, useState } from 'react';
import { PRODUCTION_ANSWER_MAX_LENGTH } from '@app/shared';
import type { AdminChunk } from '../../lib/admin';
import type { Character } from '../../lib/characters';
import type { SituationPrompt } from '../../lib/collections';
import { toPlaybackMessages } from '../../lib/dialogueImport';
import { fetchAdminDialogue, type AdminDialogue, type DialogueKind } from '../../lib/dialogues';
import { DialoguePlayback } from '../../components/dialogue/DialoguePlayback';
import { DialogueAnswerBubble } from '../../components/dialogue/DialogueAnswerBubble';
import { InteractiveWords } from '../../components/InteractiveWords';
import { Textarea } from '../../components/ui/Textarea';
import { Sheet } from '../../components/ui/Sheet';

export type PreviewMode = { kind: 'card' } | { kind: 'text'; prompt: SituationPrompt } | { kind: DialogueKind };

export function ChunkContentPreview({ chunk, mode, characters, onClose }: {
  chunk: AdminChunk;
  mode: PreviewMode;
  characters: Character[];
  onClose: () => void;
}) {
  const [dialogue, setDialogue] = useState<AdminDialogue | null>();
  const [error, setError] = useState(false);
  const [answer, setAnswer] = useState('');
  const kind = mode.kind;
  useEffect(() => {
    if (kind !== 'browse' && kind !== 'situation') return;
    let active = true;
    fetchAdminDialogue(chunk.id, kind)
      .then((value) => { if (active) setDialogue(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [chunk.id, kind]);

  const messages = dialogue ? toPlaybackMessages(dialogue, characters) : [];
  const blank = kind === 'situation' && dialogue?.messages.at(-1)?.isBlank ? messages.at(-1) : undefined;
  const example = chunk.sentences[0];

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title="Глазами ученика">
      <div className="flex flex-col gap-4">
        {kind === 'card' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <div className="text-xl font-semibold">{chunk.text}</div>
            {chunk.explanation && <p>{chunk.explanation}</p>}
            {example && <InteractiveWords parts={example.parts} fallbackText={example.text} interfaceMode="ru-en" />}
            {example && <p className="text-meta">{example.translation}</p>}
            <details><summary className="cursor-pointer text-accent">Показать перевод</summary><p>{chunk.translation}</p></details>
          </div>
        )}
        {kind === 'text' && (
          <>
            <InteractiveWords parts={mode.prompt.parts} fallbackText={mode.prompt.text} interfaceMode="ru-en" />
            <Textarea value={answer} onChange={setAnswer} placeholder="Что бы вы сказали?" rows={3} maxLength={PRODUCTION_ANSWER_MAX_LENGTH} />
          </>
        )}
        {(kind === 'browse' || kind === 'situation') && (
          error ? <p role="alert" className="text-negative">Не удалось загрузить комикс.</p>
            : dialogue === undefined ? <p className="text-meta">Загрузка…</p>
              : kind === 'browse' && messages.length ? <DialoguePlayback messages={messages} targetText={chunk.text} />
                : blank ? <>
                  <DialoguePlayback messages={messages.slice(0, -1)} />
                  <DialogueAnswerBubble characterName={blank.characterName} imageUrl={blank.imageUrl ?? ''} side={blank.side}
                    value={answer} onChange={setAnswer} maxLength={PRODUCTION_ANSWER_MAX_LENGTH} />
                </> : <p className="text-meta">Комикс пока не готов к показу.</p>
        )}
        {(kind === 'text' || kind === 'situation') && <p className="text-meta">Ответ в предпросмотре не отправляется на проверку.</p>}
      </div>
    </Sheet>
  );
}
