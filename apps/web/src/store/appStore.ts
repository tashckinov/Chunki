import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INTRO_CHUNK_COUNT } from '@app/shared';
import type { DailyCardGoal, StudyGoalStatus, CEFRLevel, ExercisesGradeResult, PlacementGradeResult, PlacementOverview, PlacementTestVariant } from '@app/shared';
import {
  fetchProgram,
  fetchPlacementResult,
  fetchPlacementVariant,
  fetchTopicStudy,
  startTopicAttempt as apiStartTopicAttempt,
  submitPlacementTest as apiSubmitPlacementTest,
  submitTopicAttempt as apiSubmitTopicAttempt,
  type ProgramState,
  type TopicAttempt,
  type TopicStudy,
  type UserTopicSummary,
} from '../lib/program';
import { fetchCurrentUser, logout, startGoogleLogin, authenticatePasskey, registerPasskey, type AuthUser } from '../lib/auth';
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
  type SituationPromptPart,
  type ProductionDialoguePayload,
} from '../lib/progress';
import { fetchStudyGoal, postStudyGoal, postStudyIntro } from '../lib/studyGoal';
import type { Tariff } from '../lib/payments';
import { fetchPaymentStatus } from '../lib/payments';

export type Screen =
  | 'goals'
  | 'test'
  | 'checking'
  | 'result'
  | 'schedule'
  | 'paywall'
  | 'checkout'
  | 'program'
  | 'topic'
  | 'exercises'
  | 'topicresult'
  | 'cardslib'
  | 'comics'
  | 'deck'
  | 'deckdone'
  | 'recognitioncheck'
  | 'productioncheck'
  | 'dialogue'
  | 'profile'
  | 'admin';

export type DeckVerdict = 'know' | 'dont' | 'bury';

/** A 403 from a program (grammar/exercises) route means the account's tariff has allowProgram=false — this reads friendlier than the raw "…failed: 403". Every other failure (network, 502 from a judge call, etc.) keeps the generic message, same as before this tariff gating existed. */
function programErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return 'Программа обучения недоступна на вашем тарифе. Оформите подписку.';
  return err instanceof Error ? err.message : String(err);
}

// How many other cards go by before a deferred "Знаю" production check comes
// due — slightly randomized so it doesn't always land on a fixed rhythm.
const DEFERRED_PRODUCTION_CHECK_MIN_DELAY = 2;
const DEFERRED_PRODUCTION_CHECK_MAX_DELAY = 4;
function randomProductionCheckDelay(): number {
  const span = DEFERRED_PRODUCTION_CHECK_MAX_DELAY - DEFERRED_PRODUCTION_CHECK_MIN_DELAY;
  return DEFERRED_PRODUCTION_CHECK_MIN_DELAY + Math.floor(Math.random() * (span + 1));
}

const BACK_MAP: Partial<Record<Screen, Screen>> = {
  goals: 'cardslib',
  test: 'goals',
  result: 'goals',
  schedule: 'result',
  paywall: 'schedule',
  // Checkout opened from the profile has its own back destination.
  checkout: 'cardslib',
  program: 'cardslib',
  topic: 'program',
  exercises: 'topic',
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

export type AdminSection = 'users' | 'content' | 'characters' | 'program' | 'grammarTests' | 'payments' | 'timecodes' | 'chunkGroups' | 'aiLogs';

interface AppState {
  screen: Screen;
  profileReturnScreen: Screen;
  checkoutFromProfile: boolean;
  /** Which admin sidebar/menu item is active — only meaningful while screen === 'admin'. */
  adminSection: AdminSection;
  /** Null until the initial /api/auth/me check resolves, or when signed out. */
  user: AuthUser | null;
  authChecked: boolean;
  authError: boolean;
  passkeyBusy: boolean;
  passkeyError: string | null;
  interfaceMode: 'ru-en' | 'en-en';
  /** Server-sourced (GET /api/payments/status) — refreshed on checkAuth(), never persisted (see partialize below). */
  premiumUntil: string | null;
  isPremium: boolean;

  from: CEFRLevel | null;
  to: CEFRLevel;
  purpose: string[];

  testVariant: PlacementTestVariant | null;
  testDraftOwner: string | null;
  lastTestVariantId: string | undefined;
  testSubmissionId: string | null;
  testFromProgram: boolean;
  testStarting: boolean;
  testStartError: string | null;
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
  placementResultOwner: string | null;
  placementResultGoal: CEFRLevel | null;
  placementResultSkipSchedule: boolean;
  placementOverview: PlacementOverview | null;

  days: number[]; // 0=Пн .. 6=Вс
  minutes: number;
  time: string;

  programTopics: UserTopicSummary[];
  grammarView: 'overview' | 'level' | 'topics';
  activeTopicId: string | null;
  topicMode: 'study' | 'read';
  learningTopic: { userId: string; topicId: string } | null;
  /** Study material cache, keyed by user_topic id — generated once server-side and cached there too, so caching here just avoids a redundant fetch. */
  topicStudyByTopic: Record<string, TopicStudy>;
  /** Set when the last openTopic() fetch failed — cleared on the next attempt. Drives TopicScreen's retry state. */
  topicStudyError: string | null;
  currentAttempt: TopicAttempt | null;
  topicAnswers: Record<number, string>;
  exerciseDrafts: Record<string, Record<number, string>>;
  exerciseResult: ExercisesGradeResult | null;
  newTopicsAddedLastResult: number;

  deckIndex: number;
  studyGoal: StudyGoalStatus | null;
  studyGoalChecked: boolean;
  introDeckOwner: string | null;
  deckCursorKey: string | null;
  lastDeckChunkByScope: Record<string, string>;
  completedIntroOwner: string | null;
  refreshStudyGoal: () => Promise<void>;
  saveStudyGoal: (goal: DailyCardGoal) => Promise<void>;
  activeDeckChunks: ChunkSummary[];
  /** Chunks the learner chose "Больше не показывать карточку" for — filtered out of every future goDeck() call. Persisted; purely a client-side display preference, not server-tracked mastery. */
  blockedChunkIds: Record<string, true>;
  /** Server-side mastery state per chunk — see lib/progress.ts. Never persisted to localStorage; refetched on load. */
  chunkProgress: Record<string, ProgressSummary>;
  /** This deck session's swipe outcomes, for DeckDoneScreen's tally — not mastery bookkeeping. */
  sessionVerdicts: Record<string, DeckVerdict>;
  /** This deck session's production-check verdicts, revealed together on DeckDoneScreen rather than inline per card. Judging runs in the background — see submitProductionCheck. */
  sessionProductionResults: Record<
    string,
    { kind: 'ok'; isAppropriate: boolean; usedChunkId: string | null; usedChunkText: string | null; feedback: string; modelAnswer?: string; checkId?: string } | { kind: 'error'; message: string }
  >;
  /** Chunks whose production-check answer was submitted but hasn't resolved yet — drives DeckDoneScreen's "still checking" indicator. */
  sessionProductionPending: Record<string, true>;
  /** chunkId → chunk text, filled in whenever a production check starts — a deferred check's chunk may not even be in this session's activeDeckChunks, so DeckDoneScreen can't always look its text up there. */
  sessionProductionChunkTexts: Record<string, string>;
  /** Set when this deck session got kicked to the summary early because the account's tariff blocked the production check (daily limit hit, or cards disallowed entirely) — drives DeckDoneScreen's upsell block. */
  productionBlock: { reason: 'limit_reached' | 'not_allowed'; upsellTariffs: Tariff[] } | null;
  /** Chunks already sent to a recognition check this session, so a repeat "don't know"/"unsure" doesn't loop. */
  recognitionAttemptedThisSession: Record<string, true>;
  /**
   * Chunks swiped "Знаю" whose production check is deliberately delayed —
   * shown only after a few other cards, instead of right away. Persisted
   * (see partialize) so an item that never came due before the deck ended
   * carries over to the next session instead of being lost; countdowns are
   * NOT deck-scoped, since a chunk's eligibility isn't either. See
   * advanceDeck()'s queue check and swipe()'s 'know' branch.
   */
  pendingProductionChecks: { chunkId: string; dueInTasks: number }[];

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
  /** Refreshes premiumUntil/isPremium from the server — called by checkAuth(); safe to call again after a checkout redirect brings the user back. */
  refreshPaymentStatus: () => Promise<boolean | null>;
  dismissAuthError: () => void;
  signInWithPasskey: (mode: 'login' | 'register') => Promise<void>;
  dismissPasskeyError: () => void;
  setInterfaceMode: (mode: 'ru-en' | 'en-en') => void;

  pickFrom: (level: CEFRLevel | null) => void;
  pickTo: (level: CEFRLevel) => void;
  togglePurpose: (p: string) => void;
  startTest: (restart?: boolean) => Promise<void>;

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
  finishSchedule: () => Promise<void>;
  skipPaywall: () => void;

  goHome: () => void;
  goProgram: () => void;
  goCardsLib: () => void;
  goDeck: (chunks?: ChunkSummary[], collectionSlug?: string) => Promise<void>;
  loadCollections: () => Promise<void>;
  /** Refetches the program (topic list + statuses) — called by checkAuth() and after grading a topic test. */
  loadProgram: () => Promise<ProgramState | undefined>;
  openPlacementResult: (id: string) => Promise<void>;
  openTopic: (userTopicId: string, mode?: 'study' | 'read') => Promise<void>;
  setNavTab: (v: number) => void;
  setAdminSection: (s: AdminSection) => void;

  goExercises: () => Promise<void>;
  setTopicAnswer: (itemIndex: number, value: string) => void;
  exPrimary: () => Promise<void>;

  onCardPointerDown: (x: number, y: number) => void;
  onCardPointerMove: (x: number, y: number) => void;
  onCardPointerUp: (cancelled?: boolean) => void;
  flipCard: () => void;
  swipe: (dir: DeckVerdict) => void;
  undoCard: () => void;
  /** Moves past the current card with no verdict recorded at all — distinct from swipe('bury'), which does record "не уверен". */
  skipCard: () => void;
  /** Adds chunkId to blockedChunkIds so it's excluded from every future goDeck() — also drops it from the deferred production-check queue, since it'll never be reviewed again. */
  blockChunk: (chunkId: string) => void;
  advanceDeck: () => void;
  /** Queues chunkId's production check for a few tasks later instead of showing it right away — see the pendingProductionChecks field doc. */
  enqueueDeferredProductionCheck: (chunkId: string) => void;
  startRecognitionCheck: (chunkId: string) => Promise<void>;
  answerRecognitionCheck: (optionId: string) => Promise<void>;
  startProductionCheck: (chunkId: string) => Promise<void>;
  setProductionAnswer: (v: string) => void;
  submitProductionCheck: () => void;
  skipProductionCheck: () => void;

  ensureLearnerDialogue: (chunkId: string) => Promise<LearnerDialogue | null>;
  handleDontKnow: (chunkId: string) => Promise<void>;
  closeDialogue: () => void;
  openDialogueFromBrowse: (chunkId: string, targetText: string, signal: AbortSignal) => Promise<void>;
}

let dragStart: { x: number; y: number } | null = null;

let programRequest = 0;
let latestAppliedProgramRequest = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'cardslib',
      profileReturnScreen: 'cardslib',
      checkoutFromProfile: false,
      adminSection: 'users',
      user: null,
      authChecked: false,
      authError: false,
      passkeyBusy: false,
      passkeyError: null,
      interfaceMode: 'ru-en',
      premiumUntil: null,
      isPremium: false,

      from: 'A2+',
      to: 'B2',
      purpose: ['Работа', 'Переезд'],

      testVariant: null,
      testDraftOwner: null,
      lastTestVariantId: undefined,
      testSubmissionId: null,
      testFromProgram: false,
      testStarting: false,
      testStartError: null,
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
      placementResultOwner: null,
      placementResultGoal: null,
      placementResultSkipSchedule: false,
      placementOverview: null,

      days: [1, 3, 5],
      minutes: 25,
      time: '19:00',

      programTopics: [],
      grammarView: 'overview',
      activeTopicId: null,
      topicMode: 'study',
      learningTopic: null,
      topicStudyByTopic: {},
      topicStudyError: null,
      currentAttempt: null,
      topicAnswers: {},
      exerciseDrafts: {},
      exerciseResult: null,
      newTopicsAddedLastResult: 0,

      deckIndex: 0,
      studyGoal: null,
      studyGoalChecked: false,
      introDeckOwner: null,
      deckCursorKey: null,
      lastDeckChunkByScope: {},
      completedIntroOwner: null,
      activeDeckChunks: [],
      blockedChunkIds: {},
      chunkProgress: {},
      sessionVerdicts: {},
      sessionProductionResults: {},
      sessionProductionPending: {},
      sessionProductionChunkTexts: {},
      productionBlock: null,
      recognitionAttemptedThisSession: {},
      pendingProductionChecks: [],

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

      go: (screen) => set((s) => {
        if (screen === 'profile' && s.screen !== 'profile' && !(s.screen === 'checkout' && s.checkoutFromProfile)) {
          return { screen, profileReturnScreen: s.screen };
        }
        if (screen === 'program') return { screen, grammarView: 'overview' };
        if (screen === 'checkout' && s.screen !== 'checkout') return { screen, checkoutFromProfile: s.screen === 'profile' };
        return { screen };
      }),
      back: () => set((s) => {
        if (s.screen === 'profile') return { screen: s.profileReturnScreen };
        if (s.screen === 'checkout' && s.checkoutFromProfile) return { screen: 'profile' };
        if ((s.screen === 'test' && s.testFromProgram) || (s.screen === 'result' && s.placementResultSkipSchedule)) {
          return { screen: 'program' };
        }
        if (s.screen === 'topic' && s.topicMode === 'read') return { screen: 'program', grammarView: 'topics' };
        if (s.screen === 'program' && s.grammarView !== 'overview') return { grammarView: 'overview' };
        return { screen: BACK_MAP[s.screen] ?? 'cardslib' };
      }),
      signIn: () => startGoogleLogin(),
      signOut: async () => {
        set({ user: null, currentAttempt: null, topicAnswers: {}, exerciseDrafts: {}, learningTopic: null, grading: false, checkingContext: null, screen: 'cardslib', profileReturnScreen: 'cardslib', checkoutFromProfile: false, studyGoal: null, studyGoalChecked: false, isPremium: false, premiumUntil: null, placementResult: null, placementResultOwner: null, placementOverview: null, programTopics: [], collections: [], collectionDetails: {}, collectionsStatus: 'idle', collectionsError: null });
        await logout().catch(() => {});
      },
      checkAuth: async () => {
        try {
          const user = await fetchCurrentUser();
          const resultOwner = get().placementResultOwner;
          set({
            user, authChecked: true,
            ...(resultOwner && resultOwner !== user?.id ? { placementResult: null, placementResultOwner: null } : {}),
          });
          if (user && get().collectionsError === 'unauthorized') void get().loadCollections();
          void get().refreshStudyGoal();
          void get().refreshPaymentStatus();
          void get().loadProgram();
        } catch {
          set({ authChecked: true });
        }
      },
      refreshPaymentStatus: async () => {
        const user = get().user;
        if (!user) return null;
        try {
          const { premiumUntil, isPremium } = await fetchPaymentStatus();
          if (get().user?.id !== user.id) return null;
          set({ premiumUntil, isPremium });
          return isPremium;
        } catch {
          // Best-effort — a failed refresh just leaves the last-known status in place.
          return null;
        }
      },
      dismissAuthError: () => set({ authError: false }),
      signInWithPasskey: async (mode) => {
        if (get().passkeyBusy) return;
        set({ passkeyBusy: true, passkeyError: null });
        try {
          const user = await (mode === 'login' ? authenticatePasskey() : registerPasskey());
          set({ user, passkeyBusy: false });
          void get().refreshStudyGoal();
          void get().refreshPaymentStatus();
          void get().loadProgram();
          if (get().collectionsError === 'unauthorized') void get().loadCollections();
        } catch {
          set({ passkeyBusy: false, passkeyError: mode === 'login'
            ? 'Не получилось войти через Passkey. Попробуйте ещё раз и выберите ключ от своего аккаунта.'
            : 'Не получилось создать аккаунт через Passkey. Попробуйте ещё раз.' });
        }
      },
      dismissPasskeyError: () => set({ passkeyError: null }),
      setInterfaceMode: (mode) => set({ interfaceMode: mode }),

      pickFrom: (level) => set({ from: level }),
      pickTo: (level) => set({ to: level }),
      togglePurpose: (p) =>
        set((s) => ({ purpose: s.purpose.includes(p) ? s.purpose.filter((x) => x !== p) : [...s.purpose, p] })),
      startTest: async (restart = false) => {
        const state = get();
        const userId = state.user?.id;
        if (!userId || state.testStarting) return;
        if (!restart && state.testDraftOwner === userId && state.testVariant) {
          set({ screen: 'test', testFromProgram: state.screen === 'program' || state.testFromProgram, gradingError: null, testStartError: null });
          return;
        }
        set({ testStarting: true, testStartError: null });
        try {
          const last = state.placementOverview?.history[0];
          const fromProgram = state.screen === 'program';
          const variant = await fetchPlacementVariant(state.lastTestVariantId ?? last?.variantId);
          if (get().user?.id !== userId || get().screen !== state.screen) return;
          set({
            screen: 'test', testVariant: variant, testDraftOwner: userId, lastTestVariantId: variant.id,
            testSubmissionId: null, testFromProgram: fromProgram || (state.screen === 'test' && state.testFromProgram),
            ...(fromProgram && last ? { from: last.level, to: last.goal, purpose: last.purpose } : {}),
            testPart: 1, qi: 0, mcqAnswers: {}, open9: '', open10: '', essay: '',
            gradingError: null, placementResult: null,
          });
        } catch (err) {
          if (get().user?.id === userId) {
            const message = err instanceof ApiError && err.status === 429
              ? 'Месячный лимит тестов исчерпан.'
              : err instanceof ApiError && err.status === 403
                ? 'Тест уровня недоступен на вашем тарифе.'
                : 'Не удалось загрузить тест. Попробуйте ещё раз.';
            set({ testStartError: message });
            void get().loadProgram();
          }
        } finally {
          set({ testStarting: false });
        }
      },

      pickMcq: (letter) => set((s) => ({ mcqAnswers: { ...s.mcqAnswers, [s.qi + 1]: letter } })),
      pickUnknown: () => set((s) => ({ mcqAnswers: { ...s.mcqAnswers, [s.qi + 1]: '—' } })),
      nextQ: () =>
        set((s) => (s.qi >= (s.testVariant?.definition.mcq.length ?? 1) - 1 ? { testPart: 2, qi: s.qi } : { qi: s.qi + 1 })),
      prevQ: () => set((s) => ({ qi: Math.max(0, s.qi - 1) })),
      setOpen9: (v) => set({ open9: v }),
      setOpen10: (v) => set({ open10: v }),
      goPart3: () => set({ testPart: 3 }),
      setEssay: (v) => set({ essay: v }),

      submitTest: async () => {
        const { user, testVariant, testDraftOwner, testFromProgram, testSubmissionId, grading, from, to, purpose, mcqAnswers, open9, open10, essay } = get();
        if (!user || !testVariant || testDraftOwner !== user.id || grading) return;
        const submissionId = testSubmissionId ?? globalThis.crypto?.randomUUID?.();
        set({ screen: 'checking', grading: true, gradingError: null, checkingContext: 'placement', testSubmissionId: submissionId ?? null });
        try {
          const { result, topics } = await apiSubmitPlacementTest({
            variantId: testVariant.id, submissionId, fromLevel: from, toLevel: to, purpose, mcqAnswers, open9, open10, essay,
          });
          if (get().user?.id !== user.id) return;
          set({
            placementResult: result, placementResultOwner: user.id, placementResultGoal: to, placementResultSkipSchedule: testFromProgram,
            grading: false, checkingContext: null, screen: 'result', programTopics: topics,
            testVariant: null, testDraftOwner: null, testSubmissionId: null, testPart: 1, qi: 0, mcqAnswers: {}, open9: '', open10: '', essay: '',
          });
        } catch (err) {
          if (get().user?.id === user.id) {
            const status = err instanceof ApiError ? err.status : null;
            const message = status === 409
              ? 'Этот тест уже проверяется. Попробуйте чуть позже.'
              : status === 429
                ? 'Проверка пока недоступна. Посмотрите остаток на вкладке «Грамматика» или попробуйте позже.'
                : status === 403
                  ? 'Тест уровня недоступен на вашем тарифе.'
                  : 'Не удалось проверить тест. Попробуйте отправить ещё раз.';
            set({ grading: false, checkingContext: null, gradingError: message, screen: 'test' });
            if (status === 429) void get().loadProgram();
          }
        }
      },

      goSchedule: () => set({ screen: 'schedule' }),
      toggleDay: (i) =>
        set((s) => ({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })),
      setMinutes: (v) => set({ minutes: Math.round(v) }),
      setTime: (t) => set({ time: t }),
      finishSchedule: async () => {
        const userId = get().user?.id;
        if (!userId) return;
        const isPremium = await get().refreshPaymentStatus();
        if (get().user?.id !== userId || get().screen !== 'schedule') return;
        set({ screen: isPremium === false ? 'paywall' : 'program' });
      },
      skipPaywall: () => set({ screen: 'program' }),

      goHome: () => set({ screen: 'cardslib' }),
      goProgram: () => set({ screen: 'program', grammarView: 'overview' }),
      goCardsLib: () => set({ screen: 'cardslib' }),
      refreshStudyGoal: async () => {
        const user = get().user;
        if (!user) return;
        try {
          const status = await fetchStudyGoal();
          if (get().user?.id !== user.id) return;
          set((s) => ({
            studyGoalChecked: true,
            studyGoal: s.studyGoal?.dailyCardGoal ? s.studyGoal : status,
            completedIntroOwner: status.dailyCardGoal && s.completedIntroOwner === user.id ? null : s.completedIntroOwner,
          }));
        } catch {
          if (get().user?.id === user.id) set({ studyGoalChecked: true });
        }
      },
      saveStudyGoal: async (goal) => {
        const user = get().user;
        if (!user) return;
        if (get().completedIntroOwner === user.id) await postStudyIntro();
        if (get().user?.id !== user.id) return;
        const status = await postStudyGoal(goal);
        if (get().user?.id === user.id) set({ studyGoal: status, completedIntroOwner: null });
      },
      goDeck: async (chunks, collectionSlug) => {
        const user = get().user;
        if (!user) return;
        if (!get().studyGoal) await get().refreshStudyGoal();
        const s = get();
        if (s.user?.id !== user.id) return;
        const introCompleted = s.studyGoal?.introCompleted || s.completedIntroOwner === s.user.id;
        if (introCompleted && !s.studyGoal?.dailyCardGoal) {
          set({ screen: 'cardslib' });
          return;
        }
        const eligible = (chunks ?? flattenChunks(Object.values(s.collectionDetails))).filter((c) => !s.blockedChunkIds[c.id]);
        if (!eligible.length) return;
        const scope = collectionSlug ? `collection:${collectionSlug}` : 'all';
        const cursorKey = `${user.id}:${scope}`;
        const lastChunk = s.lastDeckChunkByScope[cursorKey];
        const start = (eligible.findIndex((chunk) => chunk.id === lastChunk) + 1) % eligible.length;
        const size = introCompleted ? s.studyGoal?.dailyCardGoal ?? INTRO_CHUNK_COUNT : INTRO_CHUNK_COUNT;
        const resolved = [...eligible.slice(start), ...eligible.slice(0, start)].slice(0, size);
        set({
          screen: 'deck',
          introDeckOwner: introCompleted ? null : user.id,
          deckCursorKey: cursorKey,
          activeDeckChunks: resolved,
          deckIndex: 0,
          flipped: false,
          dx: 0,
          dy: 0,
          flying: null,
          sessionVerdicts: {},
          sessionProductionResults: {},
          sessionProductionPending: {},
          sessionProductionChunkTexts: {},
          productionBlock: null,
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
      loadProgram: async () => {
        const userId = get().user?.id;
        if (!userId) return;
        const request = ++programRequest;
        try {
          const program: ProgramState = await fetchProgram();
          if (get().user?.id !== userId) return;
          if (request < latestAppliedProgramRequest) return program;
          latestAppliedProgramRequest = request;
          const resetCurrentTopic = program.status === 'active' && program.topics.length === 0 && program.needsProgramBuild
            && ['topic', 'exercises', 'topicresult'].includes(get().screen);
          set({
            programTopics: program.status === 'active' ? program.topics : [],
            placementOverview: program.placement ?? null,
            ...(resetCurrentTopic ? { screen: 'program', activeTopicId: null, currentAttempt: null } : {}),
          });
          return program;
        } catch {
          // Best-effort — a failed refresh just leaves the last-known program in place.
        }
      },
      openPlacementResult: async (id) => {
        const userId = get().user?.id;
        if (!userId) return;
        const { summary, result } = await fetchPlacementResult(id);
        if (get().user?.id !== userId || get().screen !== 'program') return;
        set({ placementResult: result, placementResultOwner: userId, placementResultGoal: summary.goal, placementResultSkipSchedule: true, screen: 'result' });
      },
      openTopic: async (userTopicId, mode = 'study') => {
        const { user, programTopics } = get();
        const learning = mode === 'study' && user && programTopics.some(({ id, status }) => id === userTopicId && status === 'assigned');
        set({
          activeTopicId: userTopicId, topicMode: mode, screen: 'topic', topicStudyError: null, gradingError: null,
          ...(learning ? { learningTopic: { userId: user.id, topicId: userTopicId } } : {}),
        });
        if (get().topicStudyByTopic[userTopicId]) return;
        try {
          const study = await fetchTopicStudy(userTopicId);
          set((st) => ({ topicStudyByTopic: { ...st.topicStudyByTopic, [userTopicId]: study } }));
        } catch (err) {
          // Cache stays unset for this id, so calling openTopic(id) again (the
          // retry button in TopicScreen) naturally re-fetches.
          set({ topicStudyError: programErrorMessage(err) });
        }
      },
      setNavTab: (v) => {
        const destinations: Screen[] = ['cardslib', 'comics', 'program', 'profile'];
        get().go(destinations[v] ?? 'cardslib');
      },
      setAdminSection: (s) => set({ adminSection: s }),

      goExercises: async () => {
        const { activeTopicId: topicId, topicMode, user, screen, currentAttempt, topicAnswers } = get();
        if (!user || !topicId || topicMode === 'read' || screen === 'exercises') return;
        set((state) => ({
          screen: 'exercises', topicAnswers: {}, exerciseResult: null, currentAttempt: null, gradingError: null,
          ...(currentAttempt && !state.exerciseResult && Object.keys(topicAnswers).length
            ? { exerciseDrafts: { ...state.exerciseDrafts, [currentAttempt.attemptId]: topicAnswers } } : {}),
        }));
        const stillOpen = () => get().user?.id === user.id && get().screen === 'exercises' && get().activeTopicId === topicId;
        try {
          const attempt = await apiStartTopicAttempt(topicId);
          if (stillOpen()) set({ currentAttempt: attempt, topicAnswers: get().exerciseDrafts[attempt.attemptId] ?? {} });
        } catch (err) {
          if (stillOpen()) set({
            screen: 'topic',
            gradingError: err instanceof ApiError && err.status === 409
              ? 'Упражнения пока готовятся или уже завершены. Попробуйте открыть тему ещё раз.'
              : programErrorMessage(err),
          });
        }
      },
      setTopicAnswer: (itemIndex, value) => set((s) => {
        if (!s.currentAttempt) return s;
        const topicAnswers = { ...s.topicAnswers, [itemIndex]: value };
        return { topicAnswers, exerciseDrafts: { ...s.exerciseDrafts, [s.currentAttempt.attemptId]: topicAnswers } };
      }),

      exPrimary: async () => {
        const s = get();
        const topicId = s.activeTopicId;
        const attempt = s.currentAttempt;
        if (!topicId || !attempt) return;
        set({ screen: 'checking', grading: true, gradingError: null, checkingContext: 'exercise' });
        try {
          const { result, newTopicsAdded } = await apiSubmitTopicAttempt(topicId, attempt.attemptId, s.topicAnswers);
          const exerciseDrafts = { ...get().exerciseDrafts };
          delete exerciseDrafts[attempt.attemptId];
          set({ exerciseDrafts, exerciseResult: result, newTopicsAddedLastResult: newTopicsAdded, grading: false, screen: 'topicresult' });
          void get().loadProgram();
        } catch (err) {
          set({ grading: false, gradingError: programErrorMessage(err), screen: 'exercises' });
        }
      },

      onCardPointerDown: (x, y) => {
        if (get().flying) return; // a swipe is still being processed — the card stays off-screen until its destination screen is known
        dragStart = { x, y };
        set({ dragging: true });
      },
      onCardPointerMove: (x, y) => {
        if (!dragStart || !get().dragging) return;
        set({ dx: x - dragStart.x, dy: y - dragStart.y });
      },
      onCardPointerUp: (cancelled = false) => {
        if (!dragStart) return;
        dragStart = null;
        if (cancelled) {
          set({ dx: 0, dy: 0, dragging: false });
          return;
        }
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
            get().enqueueDeferredProductionCheck(cur.id);
            get().advanceDeck();
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
      undoCard: () => set((s) => {
        if (s.flying) return {};
        let index = s.deckIndex - 1;
        while (index >= 0 && s.blockedChunkIds[s.activeDeckChunks[index]?.id]) index -= 1;
        return index >= 0 ? { deckIndex: index, flipped: false, dx: 0, dy: 0 } : {};
      }),

      skipCard: () => {
        const s = get();
        if (s.flying || !s.activeDeckChunks[s.deckIndex]) return;
        get().advanceDeck();
      },

      // Counts as one completed "task" for every queued deferred check —
      // decremented here (not e.g. on every screen change) so a check that's
      // itself an interstitial (recognition/comic/another production check)
      // counts the same as a plain card. If something comes due, it's shown
      // in place of the next card (deckIndex does NOT advance yet — the same
      // way an immediate "Знаю" check already withheld advancing until
      // answered) rather than always moving on first.
      advanceDeck: () => {
        const s = get();
        const decremented = s.pendingProductionChecks.map((p) => ({ ...p, dueInTasks: p.dueInTasks - 1 }));
        const dueIndex = decremented.findIndex((p) => p.dueInTasks <= 0);
        if (dueIndex !== -1) {
          const due = decremented[dueIndex];
          set({ pendingProductionChecks: decremented.filter((_, i) => i !== dueIndex) });
          void get().startProductionCheck(due.chunkId);
          return;
        }
        set({ pendingProductionChecks: decremented });

        const next = s.deckIndex + 1;
        const finished = next >= s.activeDeckChunks.length;
        const owner = s.introDeckOwner;
        const introFinished = finished && owner !== null && owner === s.user?.id && s.activeDeckChunks.length > 0;
        const currentChunk = s.activeDeckChunks[s.deckIndex];
        const cursorKey = s.deckCursorKey;
        set({
          ...(currentChunk && cursorKey?.startsWith(`${s.user?.id}:`)
            ? { lastDeckChunkByScope: { ...s.lastDeckChunkByScope, [cursorKey]: currentChunk.id } }
            : {}),
          ...(introFinished ? { completedIntroOwner: owner, introDeckOwner: null } : {}),
          deckIndex: next,
          flipped: false,
          dx: 0,
          dy: 0,
          flying: null,
          recognitionChunkId: null,
          productionChunkId: null,
          screen: finished ? 'deckdone' : 'deck',
        });
        if (introFinished) void postStudyIntro().catch(() => {}); // Retried when the learner saves their goal.
      },

      enqueueDeferredProductionCheck: (chunkId) => {
        set((st) =>
          st.pendingProductionChecks.some((p) => p.chunkId === chunkId)
            ? st
            : { pendingProductionChecks: [...st.pendingProductionChecks, { chunkId, dueInTasks: randomProductionCheckDelay() }] },
        );
      },

      blockChunk: (chunkId) => {
        set((st) => ({
          blockedChunkIds: { ...st.blockedChunkIds, [chunkId]: true },
          pendingProductionChecks: st.pendingProductionChecks.filter((p) => p.chunkId !== chunkId),
        }));
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
      openDialogueFromBrowse: async (chunkId, targetText, signal) => {
        const dialogue = await get().ensureLearnerDialogue(chunkId);
        if (!dialogue || signal.aborted || get().screen !== 'comics') return;
        set({ screen: 'dialogue', dialogueChunkId: chunkId, dialogueContinuation: 'browse', learnerDialogue: { ...dialogue, targetText } });
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
            if (check.reason === 'limit_reached' || check.reason === 'not_allowed') {
              const productionBlock = { reason: check.reason, upsellTariffs: check.upsellTariffs ?? [] };
              if (get().introDeckOwner) {
                set({ productionBlock });
                get().advanceDeck();
              } else {
                set({ screen: 'deckdone', productionBlock });
              }
            } else {
              get().advanceDeck();
            }
            return;
          }
          if (check.mode === 'dialogue') {
            set((st) => ({
              screen: 'productioncheck',
              productionChunkId: check.chunkId,
              productionMode: 'dialogue',
              productionDialogue: check.dialogue,
              productionAnswer: '',
              sessionProductionChunkTexts: { ...st.sessionProductionChunkTexts, [check.chunkId]: check.chunkText },
            }));
            return;
          }
          set((st) => ({
            screen: 'productioncheck',
            productionChunkId: check.chunkId,
            productionMode: 'situation',
            productionSituation: check.situationPrompt,
            productionSituationParts: check.situationParts,
            productionDialogue: null,
            productionAnswer: '',
            sessionProductionChunkTexts: { ...st.sessionProductionChunkTexts, [check.chunkId]: check.chunkText },
          }));
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

        postProductionCheck(chunkId, answer, s.interfaceMode === 'ru-en' ? 'ru' : 'en')
          .then(({ isAppropriate, usedChunkId, usedChunkText, feedback, progress, modelAnswer, checkId }) => {
            set((st) => {
              const { [chunkId]: _drop, ...pending } = st.sessionProductionPending;
              return {
                sessionProductionPending: pending,
                sessionProductionResults: { ...st.sessionProductionResults, [chunkId]: { kind: 'ok', isAppropriate, usedChunkId, usedChunkText, feedback, modelAnswer, checkId } },
                // progress.chunkId may differ from chunkId — a fitting answer
                // can get credited to a different chunk in the same semantic
                // group (see progress/service.ts's submitProductionAnswer).
                chunkProgress: { ...st.chunkProgress, [progress.chunkId]: progress },
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
      // Interrupted placement checks persist as their editable draft screen.
      // 'checking' is a pure loading state (see submitTest/exPrimary) with no
      // way back in the UI (CheckingScreen has no NavigationBar, and
      // BACK_MAP has no entry for it) — if the tab closed/reloaded mid-check,
      // `grading` resets to false but the persisted screen doesn't, leaving
      // a permanent spinner. Bounce back to a safe screen on rehydrate.
      onRehydrateStorage: () => (state) => {
        if (state?.screen === 'checking' || (state?.screen === 'deckdone' && state.completedIntroOwner)) state.screen = 'cardslib';
        if (state?.screen === 'paywall') state.screen = 'schedule';
      },
      partialize: (s) => {
        // user/authChecked/authError are derived fresh from the session
        // cookie on every load (see checkAuth) — persisting them would show
        // a stale logged-in/out state before that check resolves.
        // collections/collectionDetails likewise come fresh from the
        // backend on every load (see loadCollections) — persisting them
        // would show stale content after it changes server-side.
        // chunkProgress is the same story — server-sourced mastery state,
        // refetched by goDeck(); persisting it risks showing stale rings.
        // premiumUntil/isPremium too — refreshed by checkAuth() via
        // refreshPaymentStatus(); persisting them risks showing a stale
        // premium badge before that refresh resolves. Program topics and
        // the placement overview also come from the server via loadProgram().
        const {
          dx,
          dy,
          dragging,
          flying,
          grading,
          gradingError,
          checkingContext,
          testStarting,
          testStartError,
          studyGoal,
          studyGoalChecked,
          topicStudyError,
          user,
          authChecked,
          authError,
          grammarView,
          passkeyBusy,
          passkeyError,
          collections,
          collectionDetails,
          collectionsStatus,
          collectionsError,
          chunkProgress,
          premiumUntil,
          isPremium,
          programTopics,
          placementOverview,
          ...rest
        } = s;
        void dx;
        void dy;
        void dragging;
        void flying;
        void grading;
        void gradingError;
        void testStarting;
        void testStartError;
        void checkingContext;
        void studyGoal;
        void studyGoalChecked;
        void topicStudyError;
        void user;
        void authChecked;
        void authError;
        void grammarView;
        void passkeyBusy;
        void passkeyError;
        void collections;
        void collectionDetails;
        void collectionsStatus;
        void collectionsError;
        void chunkProgress;
        void premiumUntil;
        void isPremium;
        void programTopics;
        void placementOverview;
        return { ...rest, screen: s.screen === 'checking' && checkingContext === 'placement' ? 'test' : s.screen };
      },
    },
  ),
);
