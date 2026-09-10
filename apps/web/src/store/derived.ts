import { EXTRA_TOPIC_DEFS, MCQ, PROGRAM_TOPICS } from '@app/shared';
import type { CEFRLevel } from '@app/shared';
import { useAppStore } from './appStore';
import { plural } from '../lib/plural';
import { DAY_LABELS } from '../lib/schedule';

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

/** Segments a per-chunk SegmentedRing shows, by chunk_progress.state. Full ring (4) gets the "mastered" checkmark treatment. */
export const MASTERY_SEGMENTS = 4;

export function segmentsForState(state: string | undefined): number {
  switch (state) {
    case 'unsure':
    case 'self_known':
      return 1; // unverified either way — a hypothesis, not yet trusted
    case 'recognition_confirmed':
      return 2;
    case 'passive':
      return 3;
    case 'active':
      return MASTERY_SEGMENTS;
    default: // 'unknown' / 'unseen' / no row at all
      return 0;
  }
}

export function deckTallyView(verdicts: Record<string, string>) {
  const tally = (dir: string) => String(Object.values(verdicts).filter((v) => v === dir).length);
  return [
    { label: 'Знаю', n: tally('know'), bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent)' },
    { label: 'Учить', n: tally('dont'), bg: 'var(--color-negative-subtle)', fg: 'var(--color-negative)' },
  ];
}

export function deckSizeLabel(count: number) {
  return `${count} ${plural(count, 'чанк', 'чанка', 'чанков')}`;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function useDeckView() {
  const s = useAppStore();
  const deck = s.activeDeckChunks;
  const flyOffsets: Record<string, [number, number]> = {
    know: [520, -60],
    dont: [-520, -60],
    bury: [0, 760],
  };
  let dx = s.dx;
  let dy = s.dy;
  if (s.flying) [dx, dy] = flyOffsets[s.flying];

  const opKnow = clamp01(dx / 36);
  const opDont = clamp01(-dx / 36);
  const vert = Math.abs(dy) > Math.abs(dx) ? 1 : 0;
  const opBury = clamp01(dy / 36) * vert;
  const maxOp = Math.max(opKnow, opDont, opBury);

  let tintColor = 'var(--color-accent)';
  if (opDont >= Math.max(opKnow, opBury)) tintColor = 'var(--color-negative)';
  if (opBury > Math.max(opKnow, opDont)) tintColor = 'var(--color-text-secondary)';

  const cur = deck[s.deckIndex] || deck[deck.length - 1];
  const behind = [1, 2]
    .map((i) => deck[s.deckIndex + i])
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
    opBury,
    tintColor,
    tintOpacity: maxOp * 0.14,
    deckCounter: `${Math.min(s.deckIndex + 1, deck.length)} / ${deck.length}`,
    deckValue: deck.length ? s.deckIndex / deck.length : 0,
  };
}
