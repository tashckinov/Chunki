import { useAppStore } from '../store/appStore';
import { useGoalsView } from '../store/derived';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';

export function GoalsScreen() {
  const { back, startTest } = useAppStore();
  const { levelsFrom, levelsTo, purposes } = useGoalsView();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar onBack={back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-8">
        <div>
          <div className="text-page-title">С чего начнём</div>
          <div className="text-body-secondary mt-2">
            Программа собирается под цель и результат теста. Открытые ответы проверяем по смыслу, а не по совпадению слов.
          </div>
        </div>

        <div>
          <div className="text-section-title mb-3">Мой уровень сейчас</div>
          <div className="flex gap-2 flex-wrap">
            {levelsFrom.map((l) => (
              <Chip key={l.label} selected={l.selected} onClick={l.pick}>
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="text-section-title mb-3">Хочу дойти до</div>
          <div className="flex gap-2 flex-wrap">
            {levelsTo.map((l) => (
              <Chip key={l.label} selected={l.selected} onClick={l.pick}>
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="text-section-title mb-3">Зачем английский</div>
          <div className="flex gap-2 flex-wrap">
            {purposes.map((p) => (
              <Chip key={p.label} selected={p.selected} onClick={p.pick}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="text-body-secondary pt-4">Дальше 11 заданий: грамматика и лексика, чтение, свободное письмо. Примерно 15 минут.</div>
        </div>
        <Button size="lg" onClick={startTest} className="w-full mt-auto">
          Перейти к тесту
        </Button>
      </div>
    </div>
  );
}
