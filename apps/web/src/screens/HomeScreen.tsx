import { PROGRAM_TOPICS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { useCalendarView, deckSizeLabel, extraListView } from '../store/derived';
import { plural } from '../lib/plural';
import { Icon } from '../components/ui/Icon';
import { List, ListItem } from '../components/ui/ListItem';
import { Button } from '../components/ui/Button';

export function HomeScreen() {
  const s = useAppStore();
  const { calStrip, calList, calFooter, nextWhen } = useCalendarView();

  const extras = extraListView(s.extrasEnabled, s.extrasRemoved);
  const extrasOn = extras.filter((e) => e.on).length;

  const currentTopic = PROGRAM_TOPICS[s.currentTopicIndex];
  const upcomingTopics = PROGRAM_TOPICS.slice(s.currentTopicIndex, s.currentTopicIndex + 3);

  return (
    <div className="scroll-clean flex-1 min-h-0 pt-2 pb-6 flex flex-col gap-5">
      {!s.hasProgram && (
        <div className="flex flex-col gap-5">
          <div className="px-6">
            <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">ПРИВЕТ</div>
            <div className="text-[28px] leading-9 mt-0.5">Пока учимся без плана</div>
          </div>
          <div className="px-6">
            <div
              onClick={() => s.go('goals')}
              className="cursor-pointer rounded-[28px] bg-primary-container text-on-primary-container p-6 flex flex-col gap-4"
            >
              <div className="text-[22px] leading-[30px]">Проверить уровень и составить программу</div>
              <div className="text-sm leading-5 tracking-[0.25px] opacity-85">
                11 заданий, около 15 минут. Не обязательно — карточки работают и без этого.
              </div>
              <div className="flex items-center gap-2 text-sm font-medium tracking-[0.1px]">
                Начать проверку <Icon name="ChevronForward" />
              </div>
            </div>
          </div>
        </div>
      )}

      {s.hasProgram && currentTopic && (
        <div className="flex flex-col gap-5">
          <div className="px-6">
            <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">
              {s.placementResult?.overallLevel ?? s.from} → {s.to}
            </div>
            <div className="text-[28px] leading-9 mt-0.5">Следующий урок</div>
          </div>

          <div className="px-6">
            <div onClick={() => s.go('topic')} className="cursor-pointer rounded-[28px] overflow-hidden bg-surface-container-low">
              <div className="px-6 py-[22px] bg-primary-container text-on-primary-container">
                <div className="flex items-center gap-2 text-xs font-medium tracking-[0.5px]">{nextWhen}</div>
                <div className="text-[26px] leading-[34px] mt-2.5">{currentTopic.title}</div>
                <div className="text-sm leading-5 tracking-[0.25px] opacity-85 mt-1.5">Материал 6 мин · 8 упражнений · с проверкой</div>
              </div>
              <div className="px-6 py-3.5 flex items-center gap-3">
                <div className="flex-1 flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 h-1.5 rounded-full bg-surface-container-highest" />
                  ))}
                </div>
                <div className="text-xs font-medium text-on-surface-variant">{s.minutes} мин</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div onClick={() => s.toggleCalendar()} className="cursor-pointer px-6 flex items-center gap-2">
              <div className="flex-1 text-sm font-medium tracking-[0.1px] text-on-surface-variant">Календарь</div>
              <div className="text-[13px] font-medium tracking-[0.1px] text-primary">{s.calOpen ? 'Свернуть' : 'Все даты'}</div>
              <div className="text-primary">
                <Icon name={s.calOpen ? 'KeyboardArrowUp' : 'KeyboardArrowDown'} />
              </div>
            </div>

            <div className="xscroll-clean px-6 pb-1 flex gap-2 overflow-x-auto">
              {calStrip.map((d) => (
                <div
                  key={d.dayIndex}
                  onClick={() => s.focusCalendarDay(d.dayIndex)}
                  className="cursor-pointer flex-none w-12 flex flex-col items-center gap-1.5"
                >
                  <div className="text-[11px] tracking-[0.4px] text-on-surface-variant">{d.day}</div>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                    style={{ background: d.bg, color: d.fg, border: `1px solid ${d.border}` }}
                  >
                    {d.num}
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: d.dot }} />
                </div>
              ))}
            </div>

            {s.calOpen && (
              <div className="px-6 flex flex-col anim-rise">
                {calList.map((l) => (
                  <div
                    key={l.dayIndex}
                    onClick={l.go}
                    className="flex gap-3.5 p-3 -mx-3 rounded-lg border-b border-outline-variant"
                    style={{ cursor: l.cursor, background: l.highlight ? 'var(--md-surface-container-low)' : 'transparent' }}
                  >
                    <div className="w-14 flex-none">
                      <div className="text-[15px] font-medium" style={{ color: l.dateFg }}>
                        {l.date}
                      </div>
                      <div className="text-[11px] tracking-[0.4px] text-on-surface-variant">{l.day}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[15px] leading-[22px]" style={{ color: l.titleFg }}>
                        {l.title}
                      </div>
                      <div className="text-xs leading-4 tracking-[0.4px] text-on-surface-variant mt-0.5">{l.meta}</div>
                    </div>
                    <div className="flex-none text-[13px] font-medium" style={{ color: l.tagFg }}>
                      {l.tag}
                    </div>
                  </div>
                ))}
                <div className="text-xs leading-[18px] tracking-[0.4px] text-on-surface-variant py-3">{calFooter}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-6">
        <div onClick={s.goDeck} className="cursor-pointer rounded-[28px] bg-tertiary-container text-on-tertiary-container px-6 py-5 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs font-medium tracking-[0.5px]">КАРТОЧКИ НА СЕГОДНЯ</div>
            <div className="text-[22px] leading-7 mt-1.5">{deckSizeLabel()}</div>
            <div className="text-[13px] leading-[18px] tracking-[0.25px] opacity-85 mt-1">Свайпом, отдельно от программы</div>
          </div>
          <div className="w-11 h-11 flex-none rounded-full bg-tertiary text-on-tertiary flex items-center justify-center">
            <Icon name="PlayArrowFilled" />
          </div>
        </div>
      </div>

      {s.hasProgram && (
        <div className="flex flex-col gap-5">
          <div className="px-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 text-sm font-medium tracking-[0.1px] text-on-surface-variant">ПРОГРАММА</div>
              <Button variant="text" size="xs" onClick={s.goProgram}>
                Все темы
              </Button>
            </div>
            <List>
              {upcomingTopics.map((tp, i) => (
                <ListItem
                  key={tp.id}
                  leading={<Icon name={i === 0 ? 'PlayArrowFilled' : 'Add'} />}
                  headline={tp.title}
                  supporting={tp.category}
                  trailing={i === 0 ? 'сейчас' : 'позже'}
                  onClick={i === 0 ? () => s.go('topic') : undefined}
                />
              ))}
            </List>
          </div>

          <div className="px-6">
            <div onClick={s.goExtras} className="cursor-pointer flex items-center gap-3 p-4 rounded-xl border border-outline-variant">
              <div className="text-primary">
                <Icon name="AddCircle" />
              </div>
              <div className="flex-1">
                <div className="text-base leading-[22px]">Доп. уроки</div>
                <div className="text-[13px] leading-[18px] tracking-[0.25px] text-on-surface-variant">
                  {extrasOn} {plural(extrasOn, 'урок включён', 'урока включено', 'уроков включено')} · {extras.length}{' '}
                  {plural(extras.length, 'слабая тема', 'слабых темы', 'слабых тем')}
                </div>
              </div>
              <div className="text-on-surface-variant">
                <Icon name="ChevronForward" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
