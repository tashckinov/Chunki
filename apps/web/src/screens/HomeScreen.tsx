import { PROGRAM_TOPICS } from '@app/shared';
import { ChevronRight, PlusCircle, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCalendarView, deckSizeLabel, extraListView } from '../store/derived';
import { plural } from '../lib/plural';
import { Card } from '../components/ui/Card';
import { ListRow } from '../components/ui/ListRow';
import { AccountRow } from '../components/ui/AccountRow';

export function HomeScreen() {
  const s = useAppStore();
  const { calStrip, calList, calFooter, nextWhen } = useCalendarView();

  const extras = extraListView(s.extrasEnabled, s.extrasRemoved);
  const extrasOn = extras.filter((e) => e.on).length;

  const currentTopic = PROGRAM_TOPICS[s.currentTopicIndex];
  const upcomingTopics = PROGRAM_TOPICS.slice(s.currentTopicIndex, s.currentTopicIndex + 3);

  return (
    <div className="scroll-clean flex-1 min-h-0 pt-2 pb-8 flex flex-col gap-9">
      <div className="min-[1200px]:hidden">
        <AccountRow variant="compact" />
      </div>
      {!s.hasProgram && (
        <div className="flex flex-col gap-5 px-5">
          <div>
            <div className="text-meta">Привет</div>
            <div className="text-page-title mt-0.5">Пока учимся без плана</div>
          </div>
          <Card variant="accent" onClick={() => s.go('goals')} className="p-6 flex flex-col gap-4">
            <div className="text-[20px] font-semibold leading-[27px]">Проверить уровень и составить программу</div>
            <div className="text-body-secondary">11 заданий, около 15 минут. Не обязательно — карточки работают и без этого.</div>
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-accent">
              Начать проверку <ChevronRight size={16} />
            </div>
          </Card>
        </div>
      )}

      {s.hasProgram && currentTopic && (
        <div className="flex flex-col gap-5 px-5">
          <div>
            <div className="text-meta">
              {s.placementResult?.overallLevel ?? s.from} → {s.to}
            </div>
            <div className="text-page-title mt-0.5">Следующий урок</div>
          </div>

          <Card onClick={() => s.go('topic')} className="p-5 border border-border flex flex-col gap-3">
            <div className="text-meta">{nextWhen}</div>
            <div className="text-[21px] font-semibold leading-[28px]">{currentTopic.title}</div>
            <div className="text-body-secondary">Материал 6 мин · 8 упражнений · с проверкой</div>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 flex gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex-1 h-1 rounded-full bg-surface-subtle" />
                ))}
              </div>
              <div className="text-meta">{s.minutes} мин</div>
            </div>
          </Card>

          <div className="flex flex-col gap-3">
            <button onClick={s.toggleCalendar} className="flex items-center gap-2 text-left">
              <div className="flex-1 text-[14px] font-medium text-text-secondary">Календарь</div>
              <div className="text-[13px] font-medium text-accent flex items-center gap-0.5">
                {s.calOpen ? 'Свернуть' : 'Все даты'}
                {s.calOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </button>

            <div className="xscroll-clean px-5 -mx-5 pb-1 flex gap-2 overflow-x-auto">
              {calStrip.map((d) => (
                <div key={d.dayIndex} className="flex-none w-11 flex flex-col items-center gap-1.5">
                  <div className="text-[11px] text-text-tertiary">{d.day}</div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-medium" style={{ background: d.bg, color: d.fg }}>
                    {d.num}
                  </div>
                  <div className="w-1 h-1 rounded-full" style={{ background: d.dot }} />
                </div>
              ))}
            </div>

            {s.calOpen && (
              <div className="flex flex-col anim-rise">
                {calList.map((l) => (
                  <ListRow
                    key={l.dayIndex}
                    onClick={l.go}
                    leading={
                      <div className="w-11 text-left">
                        <div className="text-[14px] font-medium" style={{ color: l.dateFg }}>
                          {l.date}
                        </div>
                        <div className="text-[11px] text-text-tertiary">{l.day}</div>
                      </div>
                    }
                    title={<span style={{ color: l.titleFg }}>{l.title}</span>}
                    subtitle={l.meta}
                    trailing={<span style={{ color: l.tagFg }}>{l.tag}</span>}
                  />
                ))}
                <div className="text-meta py-3">{calFooter}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-5">
        <button
          onClick={s.goDeck}
          className="pressable w-full flex items-center gap-4 rounded-[var(--radius-lg)] bg-surface-subtle px-5 py-4 text-left"
        >
          <div className="flex-1">
            <div className="text-[14px] font-medium">Карточки на сегодня</div>
            <div className="text-body-secondary mt-0.5">{deckSizeLabel()} · свайпом, отдельно от программы</div>
          </div>
          <div className="w-10 h-10 flex-none rounded-full bg-accent text-on-accent flex items-center justify-center">
            <Play size={16} fill="currentColor" />
          </div>
        </button>
      </div>

      {s.hasProgram && (
        <div className="flex flex-col gap-9">
          <div className="px-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 text-section-title">Программа</div>
              <button onClick={s.goProgram} className="pressable text-[13.5px] font-medium text-accent">
                Все темы
              </button>
            </div>
            <div>
              {upcomingTopics.map((tp, i) => (
                <ListRow
                  key={tp.id}
                  onClick={i === 0 ? () => s.go('topic') : undefined}
                  title={tp.title}
                  subtitle={tp.category}
                  trailing={i === 0 ? 'сейчас' : 'позже'}
                />
              ))}
            </div>
          </div>

          <div className="px-5">
            <ListRow
              divider={false}
              onClick={s.goExtras}
              leading={<PlusCircle size={20} className="text-accent" />}
              title="Доп. уроки"
              subtitle={`${extrasOn} ${plural(extrasOn, 'урок включён', 'урока включено', 'уроков включено')} · ${extras.length} ${plural(extras.length, 'слабая тема', 'слабых темы', 'слабых тем')}`}
              trailing={<ChevronRight size={18} className="text-text-tertiary" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
