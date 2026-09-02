import { EX_BLOCKS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { chip } from '../store/derived';
import { TopAppBar } from '../components/ui/TopAppBar';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';

export function ExercisesScreen() {
  const s = useAppStore();
  const block = EX_BLOCKS[s.exTab];
  const lastBlock = s.exTab >= EX_BLOCKS.length - 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopAppBar size="center" title="Упражнения" onBack={s.back} />
      <Tabs items={EX_BLOCKS.map((b) => b.label)} value={s.exTab} onChange={s.setExTab} />
      <div className="scroll-clean flex-1 min-h-0 px-4 pt-5 pb-6 flex flex-col gap-[18px]">
        <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">{block.meta}</div>

        {block.text && (
          <div className="text-base leading-[26px] tracking-[0.25px] p-4 rounded-xl bg-surface-container-low">{block.text}</div>
        )}

        {block.items.map((item, i) => {
          const key = `${block.key}#${i}`;
          return (
            <div key={key} className="flex flex-col gap-3">
              <div className="text-[17px] leading-[26px] tracking-[0.25px]">
                {i + 1}. {item.q}
              </div>
              {item.type === 'choice' ? (
                <div className="flex gap-2 flex-wrap">
                  {item.options.map((opt) => {
                    const on = s.exChoiceAnswers[key] === opt;
                    const c = chip(on);
                    return (
                      <div
                        key={opt}
                        onClick={() => s.setExChoice(block.key, i, opt)}
                        className="cursor-pointer px-[18px] py-3 rounded-full text-[15px] tracking-[0.25px]"
                        style={{ border: `1px solid ${c.border}`, background: c.bg, color: c.fg }}
                      >
                        {opt}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={s.exWriteAnswers[key] || ''}
                  onChange={(e) => s.setExWrite(block.key, i, e.target.value)}
                  placeholder={item.placeholder}
                  rows={item.rows}
                  className="w-full box-border p-3.5 rounded-lg border border-outline bg-transparent text-on-surface text-base leading-6 resize-none outline-none"
                />
              )}
            </div>
          );
        })}

        <div className="h-1" />
        <Button variant="filled" size="m" onClick={s.exPrimary} className="w-full h-14">
          {lastBlock ? 'Отправить на проверку' : 'Следующий блок'}
        </Button>
        <div className="text-xs leading-[18px] tracking-[0.4px] text-on-surface-variant text-center">
          Открытые ответы проверяем по смыслу. Оценка и слабые места придут после всех блоков.
        </div>
      </div>
    </div>
  );
}
