import { EX_BLOCKS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { ExerciseOption } from '../components/ui/ExerciseOption';
import { Textarea } from '../components/ui/Textarea';

export function ExercisesScreen() {
  const s = useAppStore();
  const block = EX_BLOCKS[s.exTab];
  const lastBlock = s.exTab >= EX_BLOCKS.length - 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="center" title="Упражнения" onBack={s.back} />
      <Tabs items={EX_BLOCKS.map((b) => b.label)} value={s.exTab} onChange={s.setExTab} />
      <div className="scroll-clean flex-1 min-h-0 px-5 pt-5 pb-8 flex flex-col gap-10">
        <div className="text-meta -mb-4 lowercase">{block.meta}</div>

        {block.text && <p className="text-[16px] leading-[26px] border-l-2 border-border pl-4">{block.text}</p>}

        {block.items.map((item, i) => {
          const key = `${block.key}#${i}`;
          return (
            <div key={key} className="flex flex-col gap-4">
              <div className="text-[17px] leading-[26px]">
                {i + 1}. {item.q}
              </div>
              {item.type === 'choice' ? (
                <div className="flex flex-col gap-2.5">
                  {item.options.map((opt) => (
                    <ExerciseOption key={opt} selected={s.exChoiceAnswers[key] === opt} onClick={() => s.setExChoice(block.key, i, opt)}>
                      {opt}
                    </ExerciseOption>
                  ))}
                </div>
              ) : (
                <Textarea
                  value={s.exWriteAnswers[key] || ''}
                  onChange={(v) => s.setExWrite(block.key, i, v)}
                  placeholder={item.placeholder}
                  rows={item.rows}
                />
              )}
            </div>
          );
        })}

        <Button size="lg" onClick={s.exPrimary} className="w-full">
          {lastBlock ? 'Отправить на проверку' : 'Следующий блок'}
        </Button>
        <div className="text-meta text-center -mt-6">Открытые ответы проверяем по смыслу. Оценка и слабые места придут после всех блоков.</div>
      </div>
    </div>
  );
}
