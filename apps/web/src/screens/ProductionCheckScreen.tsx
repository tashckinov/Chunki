import { useAppStore } from '../store/appStore';
import { IconButton } from '../components/ui/IconButton';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';

export function ProductionCheckScreen() {
  const s = useAppStore();

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

        <Textarea value={s.productionAnswer} onChange={s.setProductionAnswer} placeholder="Что бы вы сказали?" rows={4} />
        <Button onClick={s.submitProductionCheck} disabled={!s.productionAnswer.trim()}>
          Проверить
        </Button>
      </div>
    </div>
  );
}
