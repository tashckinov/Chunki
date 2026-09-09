import { useAppStore } from '../store/appStore';
import { IconButton } from '../components/ui/IconButton';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { CheckingScreen } from './CheckingScreen';

const VERDICT_COPY: Record<string, { label: string; className: string }> = {
  chunk_used: { label: 'В точку — вы использовали именно эту фразу!', className: 'text-positive' },
  meaning_only: { label: 'Смысл передан, но саму фразу вы пока не использовали.', className: 'text-accent' },
  not_conveyed: { label: 'Пока не совсем — попробуйте ещё раз в другой раз.', className: 'text-negative' },
};

export function ProductionCheckScreen() {
  const s = useAppStore();

  if (s.productionChecking) {
    return <CheckingScreen title="Проверяем ответ…" />;
  }

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

        {!s.productionResult && (
          <>
            <Textarea value={s.productionAnswer} onChange={s.setProductionAnswer} placeholder="Что бы вы сказали?" rows={4} />
            {s.productionCheckError && <div className="text-[13px] text-negative">Не получилось проверить ответ. Попробуйте ещё раз.</div>}
            <Button onClick={() => void s.submitProductionCheck()} disabled={!s.productionAnswer.trim()}>
              Проверить
            </Button>
          </>
        )}

        {s.productionResult && (
          <div className="flex flex-col gap-3 anim-rise">
            <div className="rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3.5 text-body">{s.productionAnswer}</div>
            <div className={`text-[15px] font-medium ${VERDICT_COPY[s.productionResult.verdict]?.className ?? ''}`}>
              {VERDICT_COPY[s.productionResult.verdict]?.label}
            </div>
            <div className="text-body-secondary">{s.productionResult.feedback}</div>
          </div>
        )}
      </div>
    </div>
  );
}
