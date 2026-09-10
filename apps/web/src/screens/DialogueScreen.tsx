import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { flattenChunks } from '../lib/collections';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { DialoguePlayback } from '../components/dialogue/DialoguePlayback';

export function DialogueScreen() {
  const s = useAppStore();
  const [done, setDone] = useState(false);

  if (!s.learnerDialogue) return null;

  // Browse mode (opened from ComicsScreen) has no active deck session, so
  // fall back to every loaded collection's chunks.
  const targetText =
    s.activeDeckChunks.find((c) => c.id === s.dialogueChunkId)?.text ??
    flattenChunks(Object.values(s.collectionDetails)).find((c) => c.id === s.dialogueChunkId)?.text ??
    null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-3 pt-2">
        <IconButton icon="Close" label="Закрыть" onClick={s.closeDialogue} />
      </div>

      <div className="scroll-clean flex-1 min-h-0 flex flex-col gap-5 px-5 py-4">
        <div className="text-[15px] text-text-secondary text-center">Посмотрите, как это звучит в живой речи</div>
        <DialoguePlayback messages={s.learnerDialogue.messages} targetText={targetText} onAllRevealed={() => setDone(true)} />
      </div>

      <div className="flex-none px-5 pb-7 pt-3">
        <Button size="lg" className="w-full" disabled={!done} onClick={s.closeDialogue}>
          Продолжить
        </Button>
      </div>
    </div>
  );
}
