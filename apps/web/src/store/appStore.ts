import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EX_BLOCKS, EXTRA_TOPIC_DEFS, PROGRAM_TOPICS } from '@app/shared';
import type { CEFRLevel, ExercisesGradeResult, PlacementGradeResult } from '@app/shared';
import { gradeExercises, gradePlacementTest } from '../lib/api';
import { fetchCurrentUser, logout, startGoogleLogin, signInWithPasskey as signInWithPasskeyCeremony, type AuthUser } from '../lib/auth';
import {
  fetchCollectionBySlug,
  fetchCollections,
  flattenChunks,
  fetchLearnerDialogue,
  ApiError,
  type ChunkSummary,
  type CollectionDetail,
  type CollectionSummary,
  type LearnerDialogue,
} from '../lib/collections';
import {
  postSort,
  getProgressForChunks,
  getRecognitionCheck,
  postRecognitionCheck,
  getProductionCheck,
  postProductionCheck,
  type ProgressSummary,
  type RecognitionOption,
  type ProductionVerdict,
  type SituationPromptPart,
  type ProductionDialoguePayload,
} from '../lib/progress';

export type Screen =
  | 'goals'
  | 'test'
  | 'checking'
  | 'result'
  | 'schedule'
  | 'paywall'
  | 'program'
  | 'topic'
  | 'exercises'
  | 'topicresult'
  | 'extras'
  | 'cardslib'
  | 'comics'
  | 'grammar'
  | 'deck'
  | 'deckdone'
  | 'recognitioncheck'
  | 'productioncheck'
  | 'dialogue'
  | 'admin';

export type DeckVerdict = 'know' | 'dont' | 'bury';

const BACK_MAP: Partial<Record<Screen, Screen>> = {
  goals: 'cardslib',
  test: 'goals',
  result: 'goals',
  schedule: 'result',
  paywall: 'schedule',
  program: 'cardslib',
  topic: 'cardslib',
  exercises: 'topic',
  extras: 'cardslib',
  topicresult: 'exercises',
  deck: 'cardslib',
  deckdone: 'cardslib',
  recognitioncheck: 'deck',
  productioncheck: 'deck',
  // Fallback only — the screen's own close button always calls the
  // dedicated closeDialogue() action, since the real return destination
  // (deck vs deckdone vs comics) is dynamic and BACK_MAP can't express that.
  dialogue: 'deck',
  admin: 'cardslib',
};

type AdminSection = 'users' | 'content' | 'characters' | 'aiLogs';

interface AppState {
  screen: Screen;
  /** Which admin sidebar/menu item is active — only meaningful while screen === 'admin'. */
  adminSection: AdminSection;
  /** Null until the initial /api/auth/me check resolves, or when signed out. */
  user: AuthUser | null;
  authChecked: boolean;
  authError: boolean;
  passkeyBusy: boolean;
  passkeyError: string | null;
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
  activeDeckChunks: ChunkSummary[];
  /** Server-side mastery state per chunk — see lib/progress.ts. Never persisted to localStorage; refetched on load. */
  chunkProgress: Record<string, ProgressSummary>;
  /** This deck session's swipe outcomes, for DeckDoneScreen's tally — not mastery bookkeeping. */
  sessionVerdicts: Record<string, DeckVerdict>;
  /** This deck session's production-check verdicts, revealed together on DeckDoneScreen rather than inline per card. Judging runs in the background — see submitProductionCheck. */
  sessionProductionResults: Record<string, { kind: 'ok'; verdict: ProductionVerdict; feedback: string; modelAnswer?: string } | { kind: 'error'; message: string }>;
  /** Chunks whose production-check answer was submitted but hasn't resolved yet — drives DeckDoneScreen's "still checking" indicator. */
  sessionProductionPending: Record<string, true>;
  /** Set when this deck session got kicked to the summary early because a free user hit the 3-check limit — drives DeckDoneScreen's upsell block. */
  productionLimitReached: boolean;
  /** Chunks already sent to a recognition check this session, so a repeat "don't know"/"unsure" doesn't loop. */
  recognitionAttemptedThisSession: Record<string, true>;

  /** Dialogue-comic fetch cache, keyed by chunk id. Key absent = not yet fetched (still loading); null = confirmed no dialogue; an object = a real one. */
  learnerDialogueByChunk: Record<string, LearnerDialogue | null>;
  dialogueChunkId: string | null;
  /** What to do once the learner closes the comic — mirrors exactly what would have happened at the trigger point if the comic hadn't been shown. */
  dialogueContinuation: 'advance' | 'recognitioncheck' | 'browse' | null;
  learnerDialogue: LearnerDialogue | null;

  recognitionChunkId: string | null;
  recognitionPrompt: string;
  recognitionOptions: RecognitionOption[];
  recognitionSelectedId: string | null;
  recognitionResult: boolean | null;

  productionChunkId: string | null;
  /** Which "Ситуация" flavor the current productionChunkId is showing — a free-text prompt, or a comic whose last line the learner writes themselves. */
  productionMode: 'situation' | 'dialogue';
  productionSituation: string;
  productionSituationParts: SituationPromptPart[];
  productionDialogue: ProductionDialoguePayload | null;
  productionAnswer: string;

  collections: CollectionSummary[];
  collectionDetails: Record<string, CollectionDetail>;
  collectionsStatus: 'idle' | 'loading' | 'loaded' | 'error';
  collectionsError: 'unauthorized' | 'error' | null;
  flipped: boolean;
  dx: number;
  dy: number;
  dragging: boolean;
  flying: DeckVerdict | null;

  go: (screen: Screen) => void;
  back: () => void;
  /** Redirects the whole page into the backend's Google OAuth flow. */
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Runs once on app start to see if a session cookie is already valid. */
  checkAuth: () => Promise<void>;
  dismissAuthError: () => void;
  signInWithPasskey: () => Promise<void>;
  dismissPasskeyError: () => void;
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
  goDeck: (chunks?: ChunkSummary[]) => void;
  loadCollections: () => Promise<void>;
  openCurrentTopic: () => void;
  setNavTab: (v: number) => void;
  setAdminSection: (s: AdminSection) => void;

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
  advanceDeck: () => void;
  startRecognitionCheck: (chunkId: string) => Promise<void>;
  answerRecognitionCheck: (optionId: string) => Promise<void>;
  startProductionCheck: (chunkId: string) => Promise<void>;
  setProductionAnswer: (v: string) => void;
  submitProductionCheck: () => void;
  skipProductionCheck: () => void;

  ensureLearnerDialogue: (chunkId: string) => Promise<LearnerDialogue | null>;
  handleDontKnow: (chunkId: string) => Promise<void>;
  closeDialogue: () => void;
  openDialogueFromBrowse: (chunkId: string) => Promise<void>;
}

let dragStart: { x: number; y: number } | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'cardslib',
      adminSection: 'users',
      user: null,
      authChecked: false,
      authError: false,
      passkeyBusy: false,
      passkeyError: null,
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
      activeDeckChunks: [],
      chunkProgress: {},
      sessionVerdicts: {},
      sessionProductionResults: {},
      sessionProductionPending: {},
      productionLimitReached: false,
      recognitionAttemptedThisSession: {},

      learnerDialogueByChunk: {},
      dialogueChunkId: null,
      dialogueContinuation: null,
      learnerDialogue: null,

      recognitionChunkId: null,
      recognitionPrompt: '',
      recognitionOptions: [],
      recognitionSelectedId: null,
      recognitionResult: null,

      productionChunkId: null,
      productionMode: 'situation',
      productionSituation: '',
      productionSituationParts: [],
      productionDialogue: null,
      productionAnswer: '',

      collections: [],
      collectionDetails: {},
      collectionsStatus: 'idle',
      collectionsError: null,
      flipped: false,
      dx: 0,
      dy: 0,
      dragging: false,
      flying: null,

      go: (screen) => set({ screen }),
      back: () => set((s) => ({ screen: BACK_MAP[s.screen] ?? 'cardslib' })),
      signIn: () => startGoogleLogin(),
      signOut: async () => {
        set({ user: null });
        await logout().catch(() => {});
      },
      checkAuth: async () => {
        try {
          const user = await fetchCurrentUser();
          set({ user, authChecked: true });
        } catch {
          set({ authChecked: true });
        }
      },
      dismissAuthError: () => set({ authError: false }),
      signInWithPasskey: async () => {
        set({ passkeyBusy: true, passkeyError: null });
        try {
          const user = await signInWithPasskeyCeremony();
          set({ user, passkeyBusy: false });
        } catch {
          set({ passkeyBusy: false, passkeyError: 'Не получилось войти через Passkey. Попробуйте ещё раз.' });
        }
      },
      dismissPasskeyError: () => set({ passkeyError: null }),
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
      subscribe: () => set({ subscribed: true, hasProgram: true, screen: 'cardslib' }),
      skipPaywall: () => set({ hasProgram: true, screen: 'cardslib' }),

      toggleCalendar: () => set((s) => ({ calOpen: !s.calOpen })),
      focusCalendarDay: (dayIndex) =>
        set((s) => ({ calOpen: !(s.calOpen && s.calFocusIndex === dayIndex), calFocusIndex: dayIndex })),

      goHome: () => set({ screen: 'cardslib' }),
      goProgram: () => set({ screen: 'program' }),
      goExtras: () => set({ screen: 'extras' }),
      goCardsLib: () => set({ screen: 'cardslib' }),
      goDeck: (chunks) => {
        const resolved = chunks ?? flattenChunks(Object.values(get().collectionDetails));
        set({
          screen: 'deck',
          activeDeckChunks: resolved,
          deckIndex: 0,
          flipped: false,
          dx: 0,
          dy: 0,
          flying: null,
          sessionVerdicts: {},
          sessionProductionResults: {},
          sessionProductionPending: {},
          productionLimitReached: false,
          recognitionAttemptedThisSession: {},
          learnerDialogueByChunk: {},
          dialogueChunkId: null,
          dialogueContinuation: null,
          learnerDialogue: null,
        });
        const chunkIds = resolved.map((c) => c.id);
        getProgressForChunks(chunkIds)
          .then((progress) => set((st) => ({ chunkProgress: { ...st.chunkProgress, ...progress } })))
          .catch(() => {});
      },
      loadCollections: async () => {
        if (get().collectionsStatus === 'loading' || get().collectionsStatus === 'loaded') return;
        set({ collectionsStatus: 'loading', collectionsError: null });
        try {
          const list = await fetchCollections();
          const details = await Promise.all(list.map((c) => fetchCollectionBySlug(c.slug)));
          const collectionDetails: Record<string, CollectionDetail> = {};
          for (const detail of details) collectionDetails[detail.slug] = detail;
          set({ collections: list, collectionDetails, collectionsStatus: 'loaded' });

          const chunkIds = flattenChunks(details).map((c) => c.id);
          getProgressForChunks(chunkIds)
            .then((progress) => set((st) => ({ chunkProgress: { ...st.chunkProgress, ...progress } })))
            .catch(() => {});
        } catch (err) {
          const unauthorized = err instanceof ApiError && err.status === 401;
          set({ collectionsStatus: 'error', collectionsError: unauthorized ? 'unauthorized' : 'error' });
        }
      },
      openCurrentTopic: () => set({ screen: 'topic' }),
      setNavTab: (v) => {
        set({ screen: (['cardslib', 'comics', 'grammar'] as Screen[])[v] ?? 'cardslib' });
      },
      setAdminSection: (s) => set({ adminSection: s }),

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
        if (get().flying) return; // a swipe is still being processed — the card stays off-screen until its destination screen is known
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
        if (s.flying) return; // a previous swipe is still being processed — ignore re-entry (button mash / repeat gesture)
        const deck = s.activeDeckChunks;
        const cur = deck[s.deckIndex];
        if (!cur) return;
        set({ flying: dir, dragging: false });
        setTimeout(async () => {
          // Deliberately NOT resetting flipped/dx/dy/flying here: deckIndex
          // hasn't advanced yet, so resetting them would snap the same card
          // back into full view (unflipped) for however long the following
          // awaits take — reading to the user as "a new card already
          // appeared" right before the comic/check screen replaces it,
          // i.e. exactly the confusing flash this is avoiding. Leaving
          // `flying` set keeps the card visually off-screen (see
          // derived.ts's flyOffsets override) until either advanceDeck()
          // resets it atomically with moving to a genuinely new card, or
          // the screen changes away from 'deck' entirely (unmounting this
          // card, so the stale transform never becomes visible again).
          set((st) => {
            const prev = st.chunkProgress[cur.id];
            const optimisticState = dir === 'know' ? 'self_known' : dir === 'dont' ? 'unknown' : 'unsure';
            return {
              sessionVerdicts: { ...st.sessionVerdicts, [cur.id]: dir },
              chunkProgress: {
                ...st.chunkProgress,
                [cur.id]: {
                  chunkId: cur.id,
                  state: optimisticState,
                  timesReviewed: (prev?.timesReviewed ?? 0) + 1,
                  timesProductionAttempted: prev?.timesProductionAttempted ?? 0,
                  timesProductionPassed: prev?.timesProductionPassed ?? 0,
                },
              },
            };
          });

          // Awaited (not fire-and-forget): the production/recognition-check
          // fetches that follow read this chunk's state back from the
          // server, so they'd race ahead of an in-flight sort otherwise.
          try {
            const progress = await postSort(cur.id, dir);
            set((st) => ({ chunkProgress: { ...st.chunkProgress, [cur.id]: progress } }));
          } catch {
            // Keep the optimistic state; the check below still runs off it.
          }

          if (dir === 'know') {
            await get().startProductionCheck(cur.id);
          } else if (dir === 'dont') {
            await get().handleDontKnow(cur.id);
          } else if (get().recognitionAttemptedThisSession[cur.id]) {
            get().advanceDeck();
          } else {
            set((st) => ({ recognitionAttemptedThisSession: { ...st.recognitionAttemptedThisSession, [cur.id]: true } }));
            await get().startRecognitionCheck(cur.id);
          }
        }, 230);
      },
      undoCard: () => set((s) => (s.deckIndex > 0 && !s.flying ? { deckIndex: s.deckIndex - 1, flipped: false, dx: 0, dy: 0 } : {})),

      advanceDeck: () => {
        const s = get();
        const next = s.deckIndex + 1;
        set({
          deckIndex: next,
          flipped: false,
          dx: 0,
          dy: 0,
          flying: null,
          recognitionChunkId: null,
          productionChunkId: null,
          screen: next >= s.activeDeckChunks.length ? 'deckdone' : 'deck',
        });
      },

      ensureLearnerDialogue: async (chunkId) => {
        const cached = get().learnerDialogueByChunk[chunkId];
        if (cached !== undefined) return cached;
        try {
          const dialogue = await fetchLearnerDialogue(chunkId);
          set((st) => ({ learnerDialogueByChunk: { ...st.learnerDialogueByChunk, [chunkId]: dialogue } }));
          return dialogue;
        } catch {
          // A failed fetch reaches the same terminal "no dialogue" state as
          // a confirmed-empty one — this cache must never hang on `undefined`.
          set((st) => ({ learnerDialogueByChunk: { ...st.learnerDialogueByChunk, [chunkId]: null } }));
          return null;
        }
      },

      // "не знаю" always shows the comic when one exists — confirmed
      // directly with the user, no suppression/viewed-tracking of any kind
      // here (unlike the production-check gate below).
      handleDontKnow: async (chunkId) => {
        const dialogue = await get().ensureLearnerDialogue(chunkId);
        const alreadyAttempted = get().recognitionAttemptedThisSession[chunkId];
        if (dialogue) {
          if (!alreadyAttempted) set((st) => ({ recognitionAttemptedThisSession: { ...st.recognitionAttemptedThisSession, [chunkId]: true } }));
          set({
            screen: 'dialogue',
            dialogueChunkId: chunkId,
            dialogueContinuation: alreadyAttempted ? 'advance' : 'recognitioncheck',
            learnerDialogue: dialogue,
          });
          return;
        }
        if (alreadyAttempted) {
          get().advanceDeck();
        } else {
          set((st) => ({ recognitionAttemptedThisSession: { ...st.recognitionAttemptedThisSession, [chunkId]: true } }));
          await get().startRecognitionCheck(chunkId);
        }
      },

      closeDialogue: () => {
        const { dialogueChunkId, dialogueContinuation } = get();
        set({ dialogueChunkId: null, dialogueContinuation: null, learnerDialogue: null });
        if (dialogueContinuation === 'advance') get().advanceDeck();
        else if (dialogueContinuation === 'recognitioncheck' && dialogueChunkId) void get().startRecognitionCheck(dialogueChunkId);
        else if (dialogueContinuation === 'browse') set({ screen: 'comics' });
        else set({ screen: 'deck' });
      },

      // Browse mode hasn't pre-fetched the dialogue — await it before
      // switching screens, so DialogueScreen never renders a blank interim state.
      openDialogueFromBrowse: async (chunkId) => {
        const dialogue = await get().ensureLearnerDialogue(chunkId);
        if (!dialogue) return;
        set({ screen: 'dialogue', dialogueChunkId: chunkId, dialogueContinuation: 'browse', learnerDialogue: dialogue });
      },

      startRecognitionCheck: async (chunkId) => {
        try {
          const check = await getRecognitionCheck(chunkId);
          set({
            screen: 'recognitioncheck',
            recognitionChunkId: check.chunkId,
            recognitionPrompt: check.prompt,
            recognitionOptions: check.options,
            recognitionSelectedId: null,
            recognitionResult: null,
          });
        } catch {
          // Chunk isn't actually eligible (state changed) or the request
          // failed — just move on rather than blocking the deck.
          get().advanceDeck();
        }
      },

      answerRecognitionCheck: async (optionId) => {
        const s = get();
        const chunkId = s.recognitionChunkId;
        if (!chunkId) return;
        try {
          const { correct, progress } = await postRecognitionCheck(chunkId, optionId, s.recognitionOptions);
          set((st) => ({
            recognitionSelectedId: optionId,
            recognitionResult: correct,
            chunkProgress: { ...st.chunkProgress, [chunkId]: progress },
          }));
          setTimeout(() => {
            if (correct) void get().startProductionCheck(chunkId);
            else get().advanceDeck();
          }, 900);
        } catch {
          get().advanceDeck();
        }
      },

      startProductionCheck: async (chunkId) => {
        try {
          const check = await getProductionCheck(chunkId);
          if (!check.available) {
            if (check.reason === 'limit_reached') {
              set({ screen: 'deckdone', productionLimitReached: true });
            } else {
              get().advanceDeck();
            }
            return;
          }
          if (check.mode === 'dialogue') {
            set({
              screen: 'productioncheck',
              productionChunkId: check.chunkId,
              productionMode: 'dialogue',
              productionDialogue: check.dialogue,
              productionAnswer: '',
            });
            return;
          }
          set({
            screen: 'productioncheck',
            productionChunkId: check.chunkId,
            productionMode: 'situation',
            productionSituation: check.situationPrompt,
            productionSituationParts: check.situationParts,
            productionDialogue: null,
            productionAnswer: '',
          });
        } catch {
          get().advanceDeck();
        }
      },

      setProductionAnswer: (v) => set({ productionAnswer: v }),

      // No API call, no verdict recorded — advanceDeck() already resets
      // productionChunkId/productionAnswer and moves the deck on.
      skipProductionCheck: () => {
        if (!get().productionChunkId) return;
        get().advanceDeck();
      },

      // Fire-and-forget: the judge call can take 20+ seconds, so this
      // doesn't block the deck — it marks the chunk pending, advances
      // immediately, and updates sessionProductionResults whenever the
      // request actually resolves (DeckDoneScreen shows pending/resolved
      // state, regardless of which screen is mounted by then).
      submitProductionCheck: () => {
        const s = get();
        const chunkId = s.productionChunkId;
        if (!chunkId) return;
        const answer = s.productionAnswer;

        set((st) => ({ sessionProductionPending: { ...st.sessionProductionPending, [chunkId]: true } }));
        get().advanceDeck();

        postProductionCheck(chunkId, answer)
          .then(({ verdict, feedback, progress, modelAnswer }) => {
            set((st) => {
              const { [chunkId]: _drop, ...pending } = st.sessionProductionPending;
              return {
                sessionProductionPending: pending,
                sessionProductionResults: { ...st.sessionProductionResults, [chunkId]: { kind: 'ok', verdict, feedback, modelAnswer } },
                chunkProgress: { ...st.chunkProgress, [chunkId]: progress },
              };
            });
          })
          .catch((err) => {
            set((st) => {
              const { [chunkId]: _drop, ...pending } = st.sessionProductionPending;
              return {
                sessionProductionPending: pending,
                sessionProductionResults: { ...st.sessionProductionResults, [chunkId]: { kind: 'error', message: err instanceof Error ? err.message : String(err) } },
              };
            });
          });
      },
    }),
    {
      name: 'chunki/v1',
      partialize: (s) => {
        // user/authChecked/authError are derived fresh from the session
        // cookie on every load (see checkAuth) — persisting them would show
        // a stale logged-in/out state before that check resolves.
        // collections/collectionDetails likewise come fresh from the
        // backend on every load (see loadCollections) — persisting them
        // would show stale content after it changes server-side.
        // chunkProgress is the same story — server-sourced mastery state,
        // refetched by goDeck(); persisting it risks showing stale rings.
        const {
          dx,
          dy,
          dragging,
          flying,
          grading,
          gradingError,
          checkingContext,
          user,
          authChecked,
          authError,
          passkeyBusy,
          passkeyError,
          collections,
          collectionDetails,
          collectionsStatus,
          collectionsError,
          chunkProgress,
          ...rest
        } = s;
        void dx;
        void dy;
        void dragging;
        void flying;
        void grading;
        void gradingError;
        void checkingContext;
        void user;
        void authChecked;
        void authError;
        void passkeyBusy;
        void passkeyError;
        void collections;
        void collectionDetails;
        void collectionsStatus;
        void collectionsError;
        void chunkProgress;
        return rest;
      },
    },
  ),
);

export function extraTopicDefs() {
  return EXTRA_TOPIC_DEFS;
}
