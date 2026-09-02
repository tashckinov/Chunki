import { CARDS, EXTRA_TOPIC_DEFS, MCQ, PROGRAM_TOPICS } from '@app/shared';
import type { CEFRLevel } from '@app/shared';
import { useAppStore } from './appStore';
import { plural } from '../lib/plural';
import { buildSessions, DAY_LABELS, formatDayMonth, startOfDay, weekdayMon0 } from '../lib/schedule';

const LEVELS_FROM: CEFRLevel[] = ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2'];
const LEVELS_TO: CEFRLevel[] = ['B1', 'B1+', 'B2', 'C1'];
const PURPOSES = ['Работа', 'Переезд', 'Учёба', 'IELTS', 'Общение'];

export function useGoalsView() {
  const { from, to, purpose, pickFrom, pickTo, togglePurpose } = useAppStore();
  return {
    levelsFrom: LEVELS_FROM.map((l) => ({ label: l, selected: from === l, pick: () => pickFrom(l) })),
    levelsTo: LEVELS_TO.map((l) => ({ label: l, selected: to === l, pick: () => pickTo(l) })),
    purposes: PURPOSES.map((p) => ({ label: p, selected: purpose.includes(p), pick: () => togglePurpose(p) })),
  };
}

export function useTestView() {
  const s = useAppStore();
  const mq = MCQ[Math.min(s.qi, MCQ.length - 1)];
  const picked = s.mcqAnswers[mq.n];
  const letters = ['A', 'B', 'C', 'D'];
  const mqOptions = mq.options.map((label, i) => ({
    letter: letters[i],
    label,
    selected: picked === letters[i],
    pick: () => s.pickMcq(letters[i]),
  }));
  const unknown = picked === '—';
  return {
    mq,
    mqOptions,
    mqCounter: `${Math.min(s.qi + 1, MCQ.length)} / 8`,
    unknown,
    mqUnanswered: !picked,
    atFirstQ: s.qi === 0,
    nextQLabel: s.qi >= MCQ.length - 1 ? 'Часть 2' : 'Дальше',
    testValue: s.testPart === 1 ? s.qi / 11 : s.testPart === 2 ? 8 / 11 : 10 / 11,
    testTitle: s.testPart === 1 ? 'Часть 1 из 3' : s.testPart === 2 ? 'Часть 2 из 3' : 'Часть 3 из 3',
    essayWords: s.essay.trim() ? s.essay.trim().split(/\s+/).length : 0,
  };
}

export function programListView(currentTopicIndex: number, completedTopics: Record<string, { scoreOutOf10: number }>) {
  return PROGRAM_TOPICS.map((topic, i) => {
    const done = i < currentTopicIndex;
    const current = i === currentTopicIndex;
    const state: 'done' | 'current' | 'next' = done ? 'done' : current ? 'current' : 'next';
    const score = done && completedTopics[topic.id] ? `${completedTopics[topic.id].scoreOutOf10}/10` : current ? 'сейчас' : '';
    return {
      id: topic.id,
      title: topic.title,
      meta: state === 'next' ? `${topic.category} · откроется по расписанию` : topic.category,
      score,
      state,
      dotLabel: state === 'done' ? '✓' : String(i + 1),
      dotBg: state === 'done' ? 'var(--color-accent)' : state === 'current' ? 'var(--color-accent-subtle)' : 'var(--color-surface-subtle)',
      dotFg: state === 'done' ? 'var(--color-on-accent)' : state === 'current' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
      titleFg: state === 'next' ? 'var(--color-text-secondary)' : 'var(--color-text)',
      scoreFg: state === 'current' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      cursor: state === 'current' ? 'pointer' : 'default',
    };
  });
}

export function extraListView(extrasEnabled: Record<string, boolean>, extrasRemoved: string[]) {
  return EXTRA_TOPIC_DEFS.filter((e) => !extrasRemoved.includes(e.key)).map((e) => ({
    key: e.key,
    title: e.title,
    on: !!extrasEnabled[e.key],
  }));
}

export function useScheduleView() {
  const s = useAppStore();
  const dayPicks = DAY_LABELS.map((label, i) => ({ label, selected: s.days.includes(i), pick: () => s.toggleDay(i) }));
  const timePicks = ['08:00', '13:00', '19:00', '21:30'].map((t) => ({ label: t, selected: s.time === t, pick: () => s.setTime(t) }));
  const perWeek = s.days.length * s.minutes;
  const weeks = Math.max(4, Math.round((14 * 45) / Math.max(30, perWeek)));
  const scheduleSummary = `${s.days.length} ${plural(s.days.length, 'занятие', 'занятия', 'занятий')} в неделю по ${s.minutes} минут — программа до ${s.to} закроется примерно за ${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')}. Напоминание в ${s.time}.`;
  return { dayPicks, timePicks, scheduleSummary };
}

export function useCalendarView() {
  const s = useAppStore();
  const extrasOn = extraListView(s.extrasEnabled, s.extrasRemoved).filter((e) => e.on).length;
  const today = startOfDay(new Date());
  const totalSessions = PROGRAM_TOPICS.length + extrasOn;
  const sessions = buildSessions(today, s.days, totalSessions);

  const calStrip = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(today.getTime() + (i - 7) * 86400000);
    const wd = weekdayMon0(date);
    const isToday = i === 7;
    const isPast = i < 7;
    const sessionIdx = sessions.findIndex((ses) => ses.date.getTime() === date.getTime());
    const isLesson = sessionIdx >= 0;
    return {
      dayIndex: i,
      day: DAY_LABELS[wd],
      num: String(date.getDate()),
      bg: isToday ? 'var(--color-accent)' : isLesson ? 'var(--color-accent-subtle)' : 'transparent',
      fg: isToday ? 'var(--color-on-accent)' : isLesson ? 'var(--color-accent)' : isPast ? 'var(--color-text-tertiary)' : 'var(--color-text)',
      dot: isLesson && !isToday ? 'var(--color-accent)' : 'transparent',
    };
  });

  const calList = sessions.slice(0, PROGRAM_TOPICS.length).map((ses, n) => {
    const topic = PROGRAM_TOPICS[n];
    const past = n < s.currentTopicIndex;
    const current = n === s.currentTopicIndex;
    const scoreLabel = past && s.completedTopics[topic.id] ? `${s.completedTopics[topic.id].scoreOutOf10}/10` : current ? 'сейчас' : s.time;
    return {
      dayIndex: ses.dayIndex,
      date: formatDayMonth(ses.date),
      day: DAY_LABELS[ses.weekday],
      title: topic.title,
      meta: topic.category,
      tag: scoreLabel,
      dateFg: current ? 'var(--color-accent)' : past ? 'var(--color-text-tertiary)' : 'var(--color-text)',
      titleFg: past ? 'var(--color-text-secondary)' : 'var(--color-text)',
      tagFg: current || past ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      cursor: current ? 'pointer' : 'default',
      highlight: s.calFocusIndex === ses.dayIndex,
      go: current ? () => s.openCurrentTopic() : undefined,
    };
  });

  const nextSes = sessions[s.currentTopicIndex];
  const deltaDays = nextSes ? Math.round((nextSes.date.getTime() - today.getTime()) / 86400000) : 0;
  const deltaLabel = deltaDays <= 0 ? 'сегодня' : `через ${deltaDays} ${plural(deltaDays, 'день', 'дня', 'дней')}`;
  const nextWhen = nextSes ? `${DAY_LABELS[nextSes.weekday]}, ${formatDayMonth(nextSes.date)}, ${s.time} · ${deltaLabel}` : s.time;

  const lastSes = sessions[sessions.length - 1];
  const calFooter = lastSes
    ? `Программа заканчивается ${formatDayMonth(lastSes.date)}. ${
        extrasOn
          ? `Доп. ${plural(extrasOn, 'урок', 'урока', 'уроков')} сдвинет даты на ${extrasOn} ${plural(extrasOn, 'занятие', 'занятия', 'занятий')}.`
          : 'Доп. уроки сдвинут даты, если включить их.'
      }`
    : '';

  return { calStrip, calList, calFooter, nextWhen, extrasOn };
}

export function deckTallyView(verdicts: Record<string, string>) {
  const tally = (dir: string) => String(Object.values(verdicts).filter((v) => v === dir).length);
  return [
    { label: 'Знаю', n: tally('know'), bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent)' },
    { label: 'Не знаю', n: tally('dont'), bg: 'var(--color-negative-subtle)', fg: 'var(--color-negative)' },
    { label: 'В коллекции', n: tally('save'), bg: 'var(--color-info-subtle)', fg: 'var(--color-info)' },
  ];
}

export function deckSizeLabel() {
  return `${CARDS.length} ${plural(CARDS.length, 'чанк', 'чанка', 'чанков')}`;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function useDeckView() {
  const s = useAppStore();
  const flyOffsets: Record<string, [number, number]> = {
    know: [520, -60],
    dont: [-520, -60],
    save: [0, -760],
    bury: [0, 760],
  };
  let dx = s.dx;
  let dy = s.dy;
  if (s.flying) [dx, dy] = flyOffsets[s.flying];

  const opKnow = clamp01(dx / 36);
  const opDont = clamp01(-dx / 36);
  const vert = Math.abs(dy) > Math.abs(dx) ? 1 : 0;
  const opSave = clamp01(-dy / 36) * vert;
  const opBury = clamp01(dy / 36) * vert;
  const maxOp = Math.max(opKnow, opDont, opSave, opBury);

  let tintColor = 'var(--color-accent)';
  if (opDont >= Math.max(opKnow, opSave, opBury)) tintColor = 'var(--color-negative)';
  if (opSave > Math.max(opKnow, opDont, opBury)) tintColor = 'var(--color-info)';
  if (opBury > Math.max(opKnow, opDont, opSave)) tintColor = 'var(--color-text-secondary)';

  const cur = CARDS[s.deckIndex] || CARDS[CARDS.length - 1];
  const behind = [1, 2]
    .map((i) => CARDS[s.deckIndex + i])
    .filter(Boolean)
    .map((_, i) => ({
      transform: `scale(${1 - (i + 1) * 0.04}) translateY(${(i + 1) * 12}px)`,
      opacity: 0.55 - i * 0.25,
    }))
    .reverse();

  return {
    cur,
    behind,
    cardTransform: `translate(${dx}px, ${dy}px) rotate(${dx / 26}deg)`,
    cardTransition: s.dragging ? 'none' : 'transform .34s cubic-bezier(.2,0,0,1)',
    opKnow,
    opDont,
    opSave,
    opBury,
    tintColor,
    tintOpacity: maxOp * 0.14,
    deckCounter: `${Math.min(s.deckIndex + 1, CARDS.length)} / ${CARDS.length} · чанки темы`,
    deckValue: s.deckIndex / CARDS.length,
  };
}
