import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EX_BLOCKS, EXTRA_TOPIC_DEFS, PROGRAM_TOPICS } from '@app/shared';
import type { CEFRLevel, ExercisesGradeResult, PlacementGradeResult } from '@app/shared';
import { gradeExercises, gradePlacementTest } from '../lib/api';
import { activeCards } from '../lib/deck';

export type Screen =
  | 'goals'
  | 'test'
  | 'checking'
  | 'result'
  | 'schedule'
  | 'paywall'
  | 'home'
  | 'program'
  | 'topic'
  | 'exercises'
  | 'topicresult'
  | 'extras'
  | 'cardslib'
  | 'deck'
  | 'deckdone';

export type DeckVerdict = 'know' | 'dont' | 'bury';

const BACK_MAP: Partial<Record<Screen, Screen>> = {
  goals: 'home',
  test: 'goals',
  result: 'goals',
  schedule: 'result',
  paywall: 'schedule',
  program: 'home',
  topic: 'home',
  exercises: 'topic',
  extras: 'home',
  topicresult: 'exercises',
  deck: 'cardslib',
  deckdone: 'cardslib',
};

export interface UserProfile {
  name: string;
  email: string;
}

interface AppState {
  screen: Screen;
  user: UserProfile | null;
  interfaceMode: 'ru-en' | 'en-en';
  hasProgram: boolean;
  plan: 'monthly' | 'yearly';
  subscribed: boolean;

  from: CEFRLevel;
  to: CEFRLevel;
  purpose: string[];

  testPart: 1 | 2 | 3;
  qi: number;
  mcqAnswers: Record<number, string>;
  open9: string;
  open10: string;
  essay: string;

  grading: boolean;
  gradingError: string | null;
  checkingContext: 'placement' | 'exercise' | null;
  placementResult: PlacementGradeResult | null;

  days: number[]; // 0=Пн .. 6=Вс
  minutes: number;
  time: string;
  calOpen: boolean;
  calFocusIndex: number | null;

  currentTopicIndex: number;
  completedTopics: Record<string, { scoreOutOf10: number }>;
  lastCompletedTopicId: string | null;

  exTab: number;
  exChoiceAnswers: Record<string, string>;
  exWriteAnswers: Record<string, string>;
  exerciseResult: ExercisesGradeResult | null;

  extrasEnabled: Record<string, boolean>;
  extrasRemoved: string[];
  confirmRemoveKey: string | null;

  deckIndex: number;
  activeDeckCardIds: string[] | null;
  masteredCardIds: string[];
  flipped: boolean;
  dx: number;
  dy: number;
  dragging: boolean;
  flying: DeckVerdict | null;
  verdicts: Record<string, DeckVerdict>;

  go: (screen: Screen) => void;
  back: () => void;
  signIn: (profile: UserProfile) => void;
  signOut: () => void;
  setInterfaceMode: (mode: 'ru-en' | 'en-en') => void;

  pickFrom: (level: CEFRLevel) => void;
  pickTo: (level: CEFRLevel) => void;
  togglePurpose: (p: string) => void;
  startTest: () => void;

  pickMcq: (letter: string) => void;
  pickUnknown: () => void;
  nextQ: () => void;
  prevQ: () => void;
  setOpen9: (v: string) => void;
  setOpen10: (v: string) => void;
  goPart3: () => void;
  setEssay: (v: string) => void;
  submitTest: () => Promise<void>;

  goSchedule: () => void;
  toggleDay: (i: number) => void;
  setMinutes: (v: number) => void;
  setTime: (t: string) => void;
  goPaywall: () => void;
  choosePlan: (key: 'monthly' | 'yearly') => void;
  subscribe: () => void;
  skipPaywall: () => void;

  toggleCalendar: () => void;
  focusCalendarDay: (dayIndex: number) => void;

  goHome: () => void;
  goProgram: () => void;
  goExtras: () => void;
  goCardsLib: () => void;
  goDeck: (cardIds?: string[]) => void;
  openCurrentTopic: () => void;
  setNavTab: (v: number) => void;

  goExercises: () => void;
  setExTab: (i: number) => void;
  setExChoice: (blockKey: string, itemIndex: number, value: string) => void;
  setExWrite: (blockKey: string, itemIndex: number, value: string) => void;
  exPrimary: () => Promise<void>;

  toggleExtra: (key: string) => void;
  requestRemoveExtra: (key: string) => void;
  cancelRemove: () => void;
  confirmRemoveNow: () => void;

  onCardPointerDown: (x: number, y: number) => void;
  onCardPointerMove: (x: number, y: number) => void;
  onCardPointerUp: () => void;
  flipCard: () => void;
  swipe: (dir: DeckVerdict) => void;
  undoCard: () => void;
}

let dragStart: { x: number; y: number } | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'home',
      user: null,
      interfaceMode: 'ru-en',
      hasProgram: false,
      plan: 'monthly',
      subscribed: false,

      from: 'A2+',
      to: 'B2',
      purpose: ['Работа', 'Переезд'],

      testPart: 1,
      qi: 0,
      mcqAnswers: {},
      open9: '',
      open10: '',
      essay: '',

      grading: false,
      gradingError: null,
      checkingContext: null,
      placementResult: null,

      days: [1, 3, 5],
      minutes: 25,
      time: '19:00',
      calOpen: false,
      calFocusIndex: null,

      currentTopicIndex: 0,
      completedTopics: {},
      lastCompletedTopicId: null,

      exTab: 0,
      exChoiceAnswers: {},
      exWriteAnswers: {},
      exerciseResult: null,

      extrasEnabled: {},
      extrasRemoved: [],
      confirmRemoveKey: null,

      deckIndex: 0,
      activeDeckCardIds: null,
      masteredCardIds: [],
      flipped: false,
      dx: 0,
      dy: 0,
      dragging: false,
      flying: null,
      verdicts: {},

      go: (screen) => set({ screen }),
      back: () => set((s) => ({ screen: BACK_MAP[s.screen] ?? 'home' })),
      signIn: (profile) => set({ user: profile }),
      signOut: () => set({ user: null }),
      setInterfaceMode: (mode) => set({ interfaceMode: mode }),

      pickFrom: (level) => set({ from: level }),
      pickTo: (level) => set({ to: level }),
      togglePurpose: (p) =>
        set((s) => ({ purpose: s.purpose.includes(p) ? s.purpose.filter((x) => x !== p) : [...s.purpose, p] })),
      startTest: () => set({ screen: 'test', testPart: 1, qi: 0, mcqAnswers: {} }),

      pickMcq: (letter) => set((s) => ({ mcqAnswers: { ...s.mcqAnswers, [s.qi + 1]: letter } })),
      pickUnknown: () => set((s) => ({ mcqAnswers: { ...s.mcqAnswers, [s.qi + 1]: '—' } })),
      nextQ: () =>
        set((s) => (s.qi >= 7 ? { testPart: 2, qi: s.qi } : { qi: s.qi + 1 })),
      prevQ: () => set((s) => ({ qi: Math.max(0, s.qi - 1) })),
      setOpen9: (v) => set({ open9: v }),
      setOpen10: (v) => set({ open10: v }),
      goPart3: () => set({ testPart: 3 }),
      setEssay: (v) => set({ essay: v }),

      submitTest: async () => {
        set({ screen: 'checking', grading: true, gradingError: null, checkingContext: 'placement' });
        const { mcqAnswers, open9, open10, essay } = get();
        try {
          const result = await gradePlacementTest({ mcqAnswers, open9, open10, essay });
          const extrasEnabled: Record<string, boolean> = {};
          for (const key of result.weakTopicKeys) extrasEnabled[key] = true;
          set({ placementResult: result, grading: false, screen: 'result', extrasEnabled });
        } catch (err) {
          set({ grading: false, gradingError: err instanceof Error ? err.message : String(err), screen: 'result' });
        }
      },

      goSchedule: () => set({ screen: 'schedule' }),
      toggleDay: (i) =>
        set((s) => ({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })),
      setMinutes: (v) => set({ minutes: Math.round(v) }),
      setTime: (t) => set({ time: t }),
      goPaywall: () => set({ screen: 'paywall' }),
      choosePlan: (key) => set({ plan: key }),
      subscribe: () => set({ subscribed: true, hasProgram: true, screen: 'home' }),
      skipPaywall: () => set({ hasProgram: true, screen: 'home' }),

      toggleCalendar: () => set((s) => ({ calOpen: !s.calOpen })),
      focusCalendarDay: (dayIndex) =>
        set((s) => ({ calOpen: !(s.calOpen && s.calFocusIndex === dayIndex), calFocusIndex: dayIndex })),

      goHome: () => set({ screen: 'home' }),
      goProgram: () => set({ screen: 'program' }),
      goExtras: () => set({ screen: 'extras' }),
      goCardsLib: () => set({ screen: 'cardslib' }),
      goDeck: (cardIds) =>
        set({ screen: 'deck', activeDeckCardIds: cardIds ?? null, deckIndex: 0, flipped: false, dx: 0, dy: 0, verdicts: {} }),
      openCurrentTopic: () => set({ screen: 'topic' }),
      setNavTab: (v) => {
        const s = get();
        if (v === 2) return set({ screen: 'cardslib' });
        if ((v === 1 || v === 3) && !s.hasProgram) return set({ screen: 'goals' });
        set({ screen: (['home', 'program', 'cardslib', 'extras'] as Screen[])[v] ?? 'home' });
      },

      goExercises: () => set({ screen: 'exercises', exTab: 0, exChoiceAnswers: {}, exWriteAnswers: {}, exerciseResult: null }),
      setExTab: (i) => set({ exTab: i }),
      setExChoice: (blockKey, itemIndex, value) =>
        set((s) => ({ exChoiceAnswers: { ...s.exChoiceAnswers, [`${blockKey}#${itemIndex}`]: value } })),
      setExWrite: (blockKey, itemIndex, value) =>
        set((s) => ({ exWriteAnswers: { ...s.exWriteAnswers, [`${blockKey}#${itemIndex}`]: value } })),

      exPrimary: async () => {
        const s = get();
        const lastBlock = s.exTab >= EX_BLOCKS.length - 1;
        if (!lastBlock) {
          set({ exTab: s.exTab + 1 });
          return;
        }
        const topic = PROGRAM_TOPICS[s.currentTopicIndex];
        set({ screen: 'checking', grading: true, gradingError: null, checkingContext: 'exercise' });
        try {
          const blockAnswers = EX_BLOCKS.map((block) => {
            const choiceAnswers: Record<number, string> = {};
            const writeAnswers: Record<number, string> = {};
            block.items.forEach((item, i) => {
              const key = `${block.key}#${i}`;
              if (item.type === 'choice' && s.exChoiceAnswers[key]) choiceAnswers[i] = s.exChoiceAnswers[key];
              if (item.type === 'write' && s.exWriteAnswers[key]) writeAnswers[i] = s.exWriteAnswers[key];
            });
            return { blockKey: block.key, choiceAnswers, writeAnswers };
          });
          const result = await gradeExercises({ topicId: topic.id, topicTitle: topic.title, blockAnswers });
          set((st) => ({
            exerciseResult: result,
            grading: false,
            screen: 'topicresult',
            completedTopics: { ...st.completedTopics, [topic.id]: { scoreOutOf10: result.scoreOutOf10 } },
            lastCompletedTopicId: topic.id,
            currentTopicIndex: Math.min(st.currentTopicIndex + 1, PROGRAM_TOPICS.length - 1),
            extrasEnabled: result.weakTopicKeys.reduce(
              (acc, k) => ({ ...acc, [k]: true }),
              { ...st.extrasEnabled },
            ),
          }));
        } catch (err) {
          set({ grading: false, gradingError: err instanceof Error ? err.message : String(err), screen: 'exercises' });
        }
      },

      toggleExtra: (key) => set((s) => ({ extrasEnabled: { ...s.extrasEnabled, [key]: !s.extrasEnabled[key] } })),
      requestRemoveExtra: (key) => set({ confirmRemoveKey: key }),
      cancelRemove: () => set({ confirmRemoveKey: null }),
      confirmRemoveNow: () =>
        set((s) =>
          s.confirmRemoveKey
            ? {
                extrasRemoved: [...s.extrasRemoved, s.confirmRemoveKey],
                extrasEnabled: { ...s.extrasEnabled, [s.confirmRemoveKey]: false },
                confirmRemoveKey: null,
              }
            : {},
        ),

      onCardPointerDown: (x, y) => {
        dragStart = { x, y };
        set({ dragging: true });
      },
      onCardPointerMove: (x, y) => {
        if (!dragStart || !get().dragging) return;
        set({ dx: x - dragStart.x, dy: y - dragStart.y });
      },
      onCardPointerUp: () => {
        if (!dragStart) return;
        dragStart = null;
        const { dx, dy, swipe } = get();
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 90) swipe(dx > 0 ? 'know' : 'dont');
        else if (dy > 90) swipe('bury');
        else set({ dx: 0, dy: 0, dragging: false });
      },
      flipCard: () => set((s) => ({ flipped: !s.flipped })),
      swipe: (dir) => {
        const s = get();
        const deck = activeCards(s.activeDeckCardIds);
        const cur = deck[s.deckIndex];
        if (!cur) return;
        set({ flying: dir, dragging: false });
        setTimeout(() => {
          const next = s.deckIndex + 1;
          set((st) => ({
            deckIndex: next,
            flipped: false,
            dx: 0,
            dy: 0,
            flying: null,
            verdicts: { ...st.verdicts, [cur.id]: dir },
            masteredCardIds: dir === 'know' && !st.masteredCardIds.includes(cur.id) ? [...st.masteredCardIds, cur.id] : st.masteredCardIds,
            screen: next >= deck.length ? 'deckdone' : 'deck',
          }));
        }, 230);
      },
      undoCard: () => set((s) => (s.deckIndex > 0 ? { deckIndex: s.deckIndex - 1, flipped: false, dx: 0, dy: 0 } : {})),
    }),
    {
      name: 'chunki/v1',
      partialize: (s) => {
        const { dx, dy, dragging, flying, grading, gradingError, checkingContext, ...rest } = s;
        void dx;
        void dy;
        void dragging;
        void flying;
        void grading;
        void gradingError;
        void checkingContext;
        return rest;
      },
    },
  ),
);

export function extraTopicDefs() {
  return EXTRA_TOPIC_DEFS;
}
