import { PRODUCTION_ANSWER_MAX_LENGTH } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { IconButton } from '../components/ui/IconButton';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';

export function ProductionCheckScreen() {
  const s = useAppStore();
  const remaining = PRODUCTION_ANSWER_MAX_LENGTH - s.productionAnswer.length;
  const chunkText = s.activeDeckChunks.find((c) => c.id === s.productionChunkId)?.text;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-3 pt-2">
        <IconButton icon="Close" label="Закрыть" onClick={s.back} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 py-6">
        <div>
          <div className="text-meta mb-2">Ситуация</div>
          <div className="text-[19px] leading-[26px] font-medium">{s.productionSituation}</div>
        </div>

        {chunkText && (
          <div className="text-meta">
            Подсказка: используйте фразу «{chunkText}»
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Textarea
            value={s.productionAnswer}
            onChange={s.setProductionAnswer}
            placeholder="Что бы вы сказали?"
            rows={4}
            maxLength={PRODUCTION_ANSWER_MAX_LENGTH}
          />
          <div className={`self-end text-meta ${remaining <= 10 ? 'text-negative' : ''}`}>
            {s.productionAnswer.length}/{PRODUCTION_ANSWER_MAX_LENGTH}
          </div>
        </div>
        <Button onClick={s.submitProductionCheck} disabled={!s.productionAnswer.trim()}>
          Проверить
        </Button>
        <Button variant="ghost" onClick={s.skipProductionCheck}>
          Пропустить
        </Button>
      </div>
    </div>
  );
}
