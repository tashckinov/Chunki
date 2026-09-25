import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';

function daysUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export function ProgramScreen() {
  const s = useAppStore();
  const topics = s.programTopics;
  const masteredCount = topics.filter((t) => t.status === 'mastered').length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title={`Программа до ${s.to}`} onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col">
        <div className="text-body-secondary mb-2">
          {topics.length} {topics.length === 1 ? 'тема' : 'тем'} · {masteredCount} подтверждено
        </div>
        {topics.map((topic, i) => {
          const due = topic.status === 'passed_once' && topic.nextReviewAt && new Date(topic.nextReviewAt).getTime() <= Date.now();
          const waiting = topic.status === 'passed_once' && !due;
          const dotBg = topic.status === 'mastered' ? 'var(--color-accent)' : due ? 'var(--color-warning-subtle)' : 'var(--color-surface-subtle)';
          const dotFg = topic.status === 'mastered' ? 'var(--color-on-accent)' : 'var(--color-text-secondary)';

          let meta: string = topic.category;
          if (topic.status === 'assigned') meta = `${topic.category} · Изучить`;
          else if (waiting && topic.nextReviewAt) meta = `${topic.category} · Проверка через ${daysUntil(topic.nextReviewAt)} дн.`;
          else if (due) meta = `${topic.category} · Готово к переподтверждению`;
          else if (topic.status === 'mastered') meta = `${topic.category} · Подтверждено`;

          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => void s.openTopic(topic.id)}
              className="pressable flex gap-3.5 py-3.5 border-b border-border last:border-b-0 text-left"
            >
              <div className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-[12px] font-medium mt-0.5" style={{ background: dotBg, color: dotFg }}>
                {topic.status === 'mastered' ? '✓' : i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[15.5px] leading-[22px]">{topic.title}</div>
                  {topic.source === 'discovered' && <span className="text-[11px] font-medium text-accent rounded-full bg-accent-subtle px-2 py-0.5">найдено ИИ</span>}
                </div>
                <div className="text-meta mt-0.5">{meta}</div>
              </div>
            </button>
          );
        })}
        {topics.length === 0 && <div className="text-body-secondary py-2">Тем пока нет.</div>}
      </div>
    </div>
  );
}
