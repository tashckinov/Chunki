import { useAppStore } from '../store/appStore';
import { useGoalsView } from '../store/derived';
import { TopAppBar } from '../components/ui/TopAppBar';
import { Button } from '../components/ui/Button';

export function GoalsScreen() {
  const { back, startTest } = useAppStore();
  const { levelsFrom, levelsTo, purposes } = useGoalsView();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopAppBar onBack={back} />
      <div className="scroll-clean flex-1 min-h-0 px-6 pb-8 flex flex-col gap-7">
        <div>
          <div className="text-[32px] leading-10">С чего начнём</div>
          <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant mt-2">
            Программа собирается под цель и результат теста. Открытые ответы проверяем по смыслу, а не по совпадению слов.
          </div>
        </div>

        <div>
          <div className="text-sm font-medium tracking-[0.1px] mb-3">Мой уровень сейчас</div>
          <div className="flex gap-2 flex-wrap">
            {levelsFrom.map((l) => (
              <div
                key={l.label}
                onClick={l.pick}
                className="cursor-pointer px-[18px] py-[10px] rounded-full text-sm font-medium tracking-[0.1px]"
                style={{ border: `1px solid ${l.border}`, background: l.bg, color: l.fg }}
              >
                {l.label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium tracking-[0.1px] mb-3">Хочу дойти до</div>
          <div className="flex gap-2 flex-wrap">
            {levelsTo.map((l) => (
              <div
                key={l.label}
                onClick={l.pick}
                className="cursor-pointer px-[18px] py-[10px] rounded-full text-sm font-medium tracking-[0.1px]"
                style={{ border: `1px solid ${l.border}`, background: l.bg, color: l.fg }}
              >
                {l.label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium tracking-[0.1px] mb-3">Зачем английский</div>
          <div className="flex gap-2 flex-wrap">
            {purposes.map((p) => (
              <div
                key={p.label}
                onClick={p.pick}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm tracking-[0.25px]"
                style={{ border: `1px solid ${p.border}`, background: p.bg, color: p.fg }}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low text-sm leading-5 tracking-[0.25px] text-on-surface-variant">
          Дальше 11 заданий: грамматика и лексика, чтение, свободное письмо. Примерно 15 минут.
        </div>
        <Button variant="filled" size="m" onClick={startTest} className="w-full h-14">
          Перейти к тесту
        </Button>
      </div>
    </div>
  );
}
