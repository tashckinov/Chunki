import { PROGRAM_TOPICS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { TopAppBar } from '../components/ui/TopAppBar';
import { Button } from '../components/ui/Button';

const CONTRAST = [
  { past: 'I worked there for two years.', perfect: "I've worked here for two years." },
  { past: 'Did you see this film?', perfect: 'Have you ever seen this film?' },
  { past: 'She lost her keys yesterday.', perfect: 'She has lost her keys — she is locked out.' },
];

const MARKERS = [
  { label: 'since 2022', active: true },
  { label: 'ever / never', active: true },
  { label: 'so far', active: true },
  { label: 'yesterday', active: false },
  { label: 'in 2019', active: false },
  { label: 'ago', active: false },
];

export function TopicScreen() {
  const s = useAppStore();
  const topic = PROGRAM_TOPICS[s.currentTopicIndex];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopAppBar title={`Тема ${s.currentTopicIndex + 1} из ${PROGRAM_TOPICS.length}`} onBack={s.back} />
      <div className="scroll-clean flex-1 min-h-0 px-6 pb-6 flex flex-col gap-5">
        <div>
          <div className="text-[28px] leading-9">{topic.title}</div>
          <div className="text-[13px] tracking-[0.4px] text-on-surface-variant mt-1.5">МАТЕРИАЛ · 6 МИН · ЗАТЕМ 8 УПРАЖНЕНИЙ</div>
        </div>
        <div className="p-4 rounded-xl bg-surface-container-low text-[15px] leading-[22px] tracking-[0.25px]">
          Тема в программе потому, что в задании 1 и в письме вы использовали Past Simple там, где нужен Perfect.
        </div>
        <div className="text-[17px] leading-7 tracking-[0.25px]">
          Past Simple ставит событие в закрытое время: <b>I worked here in 2022</b> — период закончился. Present Perfect связывает
          прошлое с сейчас: <b>I have worked here since 2022</b> — работаю до сих пор.
        </div>
        <div className="flex flex-col gap-2.5">
          {CONTRAST.map((c) => (
            <div key={c.past} className="flex gap-3 p-3.5 rounded-xl border border-outline-variant">
              <div className="flex-1 text-[15px] leading-[22px]">
                <div className="text-[11px] font-medium tracking-[0.5px] text-on-surface-variant mb-1">PAST SIMPLE</div>
                {c.past}
              </div>
              <div className="w-px bg-outline-variant" />
              <div className="flex-1 text-[15px] leading-[22px]">
                <div className="text-[11px] font-medium tracking-[0.5px] text-primary mb-1">PRESENT PERFECT</div>
                {c.perfect}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-sm font-medium tracking-[0.1px] text-on-surface-variant mb-2.5">МАРКЕРЫ ВРЕМЕНИ</div>
          <div className="flex gap-2 flex-wrap">
            {MARKERS.map((m) => (
              <div
                key={m.label}
                className="px-3.5 py-2 rounded-full text-sm"
                style={{
                  background: m.active ? 'var(--md-primary-container)' : 'var(--md-surface-container-highest)',
                  color: m.active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-secondary-container text-on-secondary-container text-[15px] leading-[22px] tracking-[0.25px]">
          Чанки этой темы: <b>I've never been to…</b>, <b>have you ever…</b>, <b>by the time I arrived</b>. Они же придут в карточках.
        </div>
        <Button variant="filled" size="m" onClick={s.goExercises} className="w-full h-14">
          К упражнениям
        </Button>
      </div>
    </div>
  );
}
