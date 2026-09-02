import { PROGRAM_TOPICS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Button } from '../components/ui/Button';

const CONTRAST = [
  { past: 'I worked there for two years.', perfect: "I've worked here for two years." },
  { past: 'Did you see this film?', perfect: 'Have you ever seen this film?' },
  { past: 'She lost her keys yesterday.', perfect: 'She has lost her keys — she is locked out.' },
];

const MARKERS = ['since 2022', 'ever / never', 'so far', 'yesterday', 'in 2019', 'ago'];

export function TopicScreen() {
  const s = useAppStore();
  const topic = PROGRAM_TOPICS[s.currentTopicIndex];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title={`Тема ${s.currentTopicIndex + 1} из ${PROGRAM_TOPICS.length}`} onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-7">
        <div>
          <div className="text-page-title">{topic.title}</div>
          <div className="text-meta mt-1.5">Материал · 6 мин · затем 8 упражнений</div>
        </div>

        <p className="text-body-secondary border-l-2 border-border pl-4">
          Тема в программе потому, что в задании 1 и в письме вы использовали Past Simple там, где нужен Perfect.
        </p>

        <p className="text-[17px] leading-[27px]">
          Past Simple ставит событие в закрытое время: <b>I worked here in 2022</b> — период закончился. Present Perfect связывает
          прошлое с сейчас: <b>I have worked here since 2022</b> — работаю до сих пор.
        </p>

        <div className="flex flex-col divide-y divide-border border-t border-b border-border">
          {CONTRAST.map((c) => (
            <div key={c.past} className="flex gap-4 py-4">
              <div className="flex-1 text-[15px] leading-[22px]">
                <div className="text-meta mb-1">Past Simple</div>
                {c.past}
              </div>
              <div className="flex-1 text-[15px] leading-[22px]">
                <div className="text-[12.5px] font-medium text-accent mb-1">Present Perfect</div>
                {c.perfect}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-section-title mb-3">Маркеры времени</div>
          <div className="flex gap-2 flex-wrap">
            {MARKERS.map((m) => (
              <span key={m} className="rounded-full bg-surface-subtle px-3.5 py-2 text-[14px] text-text-secondary">
                {m}
              </span>
            ))}
          </div>
        </div>

        <p className="text-body-secondary border-l-2 border-accent pl-4">
          Чанки этой темы: <b className="text-text">I've never been to…</b>, <b className="text-text">have you ever…</b>,{' '}
          <b className="text-text">by the time I arrived</b>. Они же придут в карточках.
        </p>

        <Button size="lg" onClick={s.goExercises} className="w-full">
          К упражнениям
        </Button>
      </div>
    </div>
  );
}
