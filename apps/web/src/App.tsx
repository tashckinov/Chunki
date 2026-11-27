import { useProductAnalytics } from './lib/useProductAnalytics';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useAppStore, type Screen } from './store/appStore';
import { consumeAuthErrorFlag, consumeAuthToken } from './lib/auth';
import { BottomNavigation, type NavItem } from './components/ui/BottomNavigation';
import { Icon, type IconName } from './components/ui/Icon';
import { IconButton } from './components/ui/IconButton';
import { Logo } from './components/brand/Logo';
import { AccountRow } from './components/ui/AccountRow';
import { StudyGoalScreen } from './screens/StudyGoalScreen';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { GoalsScreen } from './screens/GoalsScreen';
import { TestScreen } from './screens/TestScreen';
import { CheckingScreen } from './screens/CheckingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { PaywallScreen } from './screens/PaywallScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ProgramScreen } from './screens/ProgramScreen';
import { ComicsScreen } from './screens/ComicsScreen';
import { TopicScreen } from './screens/TopicScreen';
import { ExercisesScreen } from './screens/ExercisesScreen';
import { TopicResultScreen } from './screens/TopicResultScreen';
import { CardsScreen } from './screens/CardsScreen';
import { DeckScreen } from './screens/DeckScreen';
import { DeckDoneScreen } from './screens/DeckDoneScreen';
import { RecognitionCheckScreen } from './screens/RecognitionCheckScreen';
import { ProductionCheckScreen } from './screens/ProductionCheckScreen';
import { DialogueScreen } from './screens/DialogueScreen';
import { HomeScreen } from './screens/HomeScreen';
import { GuestGalleryScreen } from './screens/GuestGalleryScreen';
import { AdminScreen } from './screens/admin/AdminScreen';
import { ADMIN_SECTIONS } from './screens/admin/sections';

const SIDEBAR_ITEMS: { label: string; icon: IconName }[] = [
  { label: 'Главная', icon: 'Today' },
  { label: 'Карточки', icon: 'Stars' },
  { label: 'Комиксы', icon: 'Characters' },
  { label: 'Обучение', icon: 'CheckBox' },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: 'Главная', icon: 'Today' },
  { label: 'Карточки', icon: 'Stars' },
  { label: 'Комиксы', icon: 'Characters' },
  { label: 'Обучение', icon: 'CheckBox' },
  { label: 'Профиль', account: true },
];

function CheckingScreenForContext() {
  const ctx = useAppStore((s) => s.checkingContext);
  const title = ctx === 'exercise' ? 'Проверяем ваши упражнения' : 'Проверяем ваши ответы';
  return <CheckingScreen title={title} />;
}

function CurrentScreen({ onOpenAdminMenu }: { onOpenAdminMenu: () => void }) {
  const screen = useAppStore((s) => s.screen);
  const user = useAppStore((s) => s.user);
  const hasTestDraft = useAppStore((s) => !!s.testVariant && s.testDraftOwner === s.user?.id);
  const browsingComic = useAppStore((s) => s.screen === 'dialogue' && s.dialogueContinuation === 'browse');
  if (!user && screen !== 'profile') return <GuestGalleryScreen />;
  if (screen === 'comics' || browsingComic) return (
    <>
      <div className={browsingComic ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        <ComicsScreen />
      </div>
      {browsingComic && <DialogueScreen />}
    </>
  );
  switch (screen) {
    case 'home':
      return <HomeScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'goals':
      return <GoalsScreen />;
    case 'test':
      return hasTestDraft ? <TestScreen /> : <GoalsScreen />;
    case 'checking':
      return <CheckingScreenForContext />;
    case 'result':
      return <ResultScreen />;
    case 'schedule':
      return <ScheduleScreen />;
    case 'paywall':
      return <PaywallScreen />;
    case 'checkout':
      return <CheckoutScreen />;
    case 'program':
      return <ProgramScreen />;
    case 'topic':
      return <TopicScreen />;
    case 'exercises':
      return <ExercisesScreen />;
    case 'topicresult':
      return <TopicResultScreen />;
    case 'cardslib':
      return <CardsScreen />;
    case 'deck':
      return <DeckScreen />;
    case 'deckdone':
      return <DeckDoneScreen />;
    case 'recognitioncheck':
      return <RecognitionCheckScreen />;
    case 'productioncheck':
      return <ProductionCheckScreen />;
    case 'dialogue':
      return <DialogueScreen />;
    case 'admin':
      return <AdminScreen onOpenMenu={onOpenAdminMenu} />;
    default:
      return <CardsScreen />;
  }
}

function SidebarNav({ value, onChange, onClose, compact = false, onToggle }: {
  value: number;
  onChange: (v: number) => void;
  onClose?: () => void;
  compact?: boolean;
  onToggle?: () => void;
}) {
  const goHome = useAppStore((s) => s.goHome);
  const screen = useAppStore((s) => s.screen);
  const adminSection = useAppStore((s) => s.adminSection);
  const setAdminSection = useAppStore((s) => s.setAdminSection);
  const back = useAppStore((s) => s.back);
  const inAdmin = screen === 'admin';
  const items = inAdmin
    ? ADMIN_SECTIONS.map((item) => ({ ...item, active: item.section === adminSection, select: () => setAdminSection(item.section) }))
    : SIDEBAR_ITEMS.map((item, index) => ({ ...item, active: index === value, select: () => onChange(index) }));
  const row = `pressable flex min-h-11 shrink-0 items-center gap-3 rounded-[var(--radius-md)] py-2.5 text-left text-[14.5px] font-medium ${compact ? 'justify-center' : 'px-3'}`;

  return (
    <nav
      aria-label="Боковое меню"
      className={`flex h-full flex-col gap-1 overflow-y-auto bg-surface py-4
        ${onClose ? 'touch-pan-y' : 'border-r border-border'}
        ${compact ? 'ml-auto w-16 px-2' : 'w-full px-3'}`}
    >
      <div className={`mb-4 flex shrink-0 items-center gap-2 ${compact ? 'justify-center' : ''}`}>
        {onClose && <IconButton icon="Close" label="Свернуть меню" onClick={onClose} />}
        {!compact && (
          <button type="button" onClick={() => { goHome(); onClose?.(); }} className="pressable flex min-w-0 items-center gap-2 text-left">
            <Logo size={26} />
            <span className="text-[17px] font-semibold">Chunki</span>
          </button>
        )}
        {onToggle && (
          <span className={compact ? undefined : 'ml-auto'}>
            <IconButton icon={compact ? 'PanelLeftOpen' : 'PanelLeftClose'}
              label={compact ? 'Развернуть боковое меню' : 'Свернуть боковое меню'} onClick={onToggle} />
          </span>
        )}
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          aria-current={item.active ? 'page' : undefined}
          title={compact ? item.label : undefined}
          onClick={() => { item.select(); onClose?.(); }}
          className={`${row} ${item.active ? 'bg-accent-subtle text-accent' : 'text-text-secondary'}`}
        >
          <Icon name={item.icon} size={19} />
          <span className={compact ? 'sr-only' : undefined}>{item.label}</span>
        </button>
      ))}
      <div className="flex-1" />
      {inAdmin && (
        <button type="button" title={compact ? 'Назад к приложению' : undefined}
          onClick={() => { back(); onClose?.(); }} className={`${row} text-text-secondary`}>
          <Icon name="ArrowBack" size={19} />
          <span className={compact ? 'sr-only' : undefined}>Назад к приложению</span>
        </button>
      )}
      <div className="shrink-0 border-t border-border pt-3">
        <AccountRow active={value === 4} compact={compact} onClick={() => { onChange(4); onClose?.(); }} />
      </div>
    </nav>
  );
}

function SidebarGesture({ onSwipe }: { onSwipe: () => void }) {
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  function finish(event: PointerEvent<HTMLDivElement>) {
    const gesture = start.current;
    start.current = null;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const horizontal = event.clientX - gesture.x;
    const vertical = Math.abs(event.clientY - gesture.y);
    if (horizontal >= 48 && horizontal > vertical * 1.5) onSwipe();
  }

  return <div aria-hidden="true" className="fixed inset-y-0 left-0 z-10 w-3 touch-pan-y min-[1200px]:hidden"
    onPointerDown={(event) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      start.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerUp={finish}
    onPointerCancel={() => { start.current = null; }}
    onLostPointerCapture={() => { start.current = null; }}
  />;
}

function navTabForScreen(screen: Screen, checkoutFromProfile: boolean, homeTopic: boolean, browsingComic: boolean): number {
  switch (screen) {
    case 'comics':
      return 2;
    case 'profile':
      return 4;
    case 'checkout':
      return checkoutFromProfile ? 4 : 3;
    case 'goals':
    case 'test':
    case 'checking':
    case 'result':
    case 'schedule':
    case 'paywall':
    case 'program':
      return 3;
    case 'topic':
    case 'exercises':
    case 'topicresult':
      return homeTopic ? 0 : 3;
    case 'dialogue':
      return browsingComic ? 2 : 1;
    case 'cardslib':
    case 'deck':
    case 'deckdone':
    case 'recognitioncheck':
    case 'productioncheck':
      return 1;
    default:
      return 0;
  }
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const drawerGesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const screen = useAppStore((s) => s.screen);
  const navTab = useAppStore((s) => navTabForScreen(s.screen, s.checkoutFromProfile, s.topicReturnScreen === 'home', s.dialogueContinuation === 'browse'));
  const setNavTab = useAppStore((s) => s.setNavTab);
  const authChecked = useAppStore((s) => s.authChecked);
  const user = useAppStore((s) => s.user);
  const loggedOut = !user;
  useProductAnalytics(user?.id);
  const inAdmin = screen === 'admin' && user?.isAdmin;
  const dialogueContinuation = useAppStore((state) => state.dialogueContinuation);
  const studying = screen === 'deck' || screen === 'deckdone' || screen === 'recognitioncheck'
    || screen === 'productioncheck' || (screen === 'dialogue' && dialogueContinuation !== 'browse');
  const studyGoal = useAppStore((s) => s.studyGoal);
  const completedIntroOwner = useAppStore((s) => s.completedIntroOwner);
  const studyGoalChecked = useAppStore((s) => s.studyGoalChecked);
  // A device can remember the intro after a goal was set on another device.
  // Resolve that case before choosing between the survey and the navigation shell.
  const waitingForStartup = !authChecked || (!!user && completedIntroOwner === user.id && !studyGoalChecked);
  const showStudyGoal = user && screen !== 'deckdone' && !studyGoal?.dailyCardGoal
    && (studyGoal?.introCompleted || completedIntroOwner === user.id);

  useEffect(() => {
    if (consumeAuthToken()) useAppStore.getState().goHome();
    if (consumeAuthErrorFlag()) useAppStore.setState({ authError: true });
    useAppStore.getState().checkAuth();
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)');
    const closeMobileMenu = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeMobileMenu);
    return () => desktop.removeEventListener('change', closeMobileMenu);
  }, []);

  useEffect(() => {
    if (!inAdmin || showStudyGoal) setSidebarOpen(false);
  }, [inAdmin, showStudyGoal]);

  const openSidebar = () => setSidebarOpen(true);

  return (
    <>
      {waitingForStartup ? (
        <div className="grid h-dvh place-items-center bg-bg text-body-secondary" role="status">Загрузка Chunki…</div>
      ) : showStudyGoal ? <StudyGoalScreen key={user.id} /> : (
        <div className={`h-dvh w-full flex justify-center bg-bg overflow-hidden ${studying ? 'study-session text-text' : ''}`}>
          {!loggedOut && (
            <div className="hidden w-[248px] flex-none min-[1200px]:block">
              <SidebarNav value={navTab} onChange={setNavTab} compact={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((value) => !value)} />
            </div>
          )}
          <div className={`w-full min-[768px]:max-w-[720px] ${loggedOut ? 'min-[1200px]:max-w-[1040px]' : 'min-[1200px]:max-w-[860px]'} h-dvh overflow-hidden flex flex-col`}>
            <CurrentScreen onOpenAdminMenu={openSidebar} />
            {screen !== 'admin' && !loggedOut && !studying && (
              <div className="flex-none min-[1200px]:hidden">
                <BottomNavigation items={MOBILE_NAV_ITEMS} value={navTab} onChange={setNavTab} />
              </div>
            )}
          </div>
          {inAdmin && !sidebarOpen && <SidebarGesture onSwipe={openSidebar} />}
          {inAdmin && (
            <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-20 bg-[color:var(--tok-scrim)]" />
                <Dialog.Popup
                  className="fixed inset-y-0 left-0 z-20 w-[min(280px,85vw)] touch-pan-y bg-surface shadow-[var(--shadow-md)] motion-safe:transition-transform data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full"
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch' || !event.isPrimary || !event.currentTarget.contains(event.target as Node)) return;
                    drawerGesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                  }}
                  onPointerCancel={() => { drawerGesture.current = null; }}
                  onPointerUp={(event) => {
                    const start = drawerGesture.current;
                    drawerGesture.current = null;
                    if (!start || start.id !== event.pointerId) return;
                    const distance = start.x - event.clientX;
                    if (distance >= 48 && distance > Math.abs(start.y - event.clientY) * 1.5) setSidebarOpen(false);
                  }}
                >
                  <Dialog.Title className="sr-only">Меню админки</Dialog.Title>
                  <SidebarNav value={navTab} onChange={setNavTab} onClose={() => setSidebarOpen(false)} />
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>
      )}
      <UpdatePrompt />
    </>
  );
}
