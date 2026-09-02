import { PROGRAM_TOPICS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { programListView, extraListView } from '../store/derived';
import { plural } from '../lib/plural';
import { TopAppBar } from '../components/ui/TopAppBar';

export function ProgramScreen() {
  const s = useAppStore();
  const list = programListView(s.currentTopicIndex, s.completedTopics);
  const extrasOn = extraListView(s.extrasEnabled, s.extrasRemoved).filter((e) => e.on).length;
  const doneCount = s.currentTopicIndex;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopAppBar size="medium" title={`Программа до ${s.to}`} onBack={s.back} />
      <div className="scroll-clean flex-1 min-h-0 px-6 pt-2 pb-6 flex flex-col gap-2">
        <div className="text-[13px] leading-[18px] tracking-[0.25px] text-on-surface-variant mb-2">
          {PROGRAM_TOPICS.length} тем · {doneCount} пройдено · {extrasOn} доп. {plural(extrasOn, 'урок', 'урока', 'уроков')} в расписании
        </div>
        {list.map((p, i) => (
          <div
            key={p.id}
            onClick={() => {
              if (p.state === 'current') s.go('topic');
            }}
            className="flex gap-3.5 py-3.5 border-b border-outline-variant"
            style={{ cursor: p.cursor }}
          >
            <div
              className="w-8 h-8 flex-none rounded-full flex items-center justify-center text-xs font-medium"
              style={{ background: p.dotBg, color: p.dotFg }}
            >
              {p.dotLabel === '✓' ? '✓' : i + 1}
            </div>
            <div className="flex-1">
              <div className="text-base leading-[22px]" style={{ color: p.titleFg }}>
                {p.title}
              </div>
              <div className="text-[13px] leading-[18px] tracking-[0.25px] text-on-surface-variant mt-0.5">{p.meta}</div>
            </div>
            <div className="text-[13px] font-medium flex-none" style={{ color: p.scoreFg }}>
              {p.score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
