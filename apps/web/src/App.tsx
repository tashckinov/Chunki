import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useAppStore } from './store/appStore';
import { consumeAuthErrorFlag, consumeAuthToken } from './lib/auth';
import { BottomNavigation, type NavItem } from './components/ui/BottomNavigation';
import { Icon, type IconName } from './components/ui/Icon';
import { IconButton } from './components/ui/IconButton';
import { SidebarMenuContext } from './components/ui/sidebarMenu';
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
import { GuestGalleryScreen } from './screens/GuestGalleryScreen';
import { AdminScreen } from './screens/admin/AdminScreen';
import { ADMIN_SECTIONS } from './screens/admin/sections';

const SIDEBAR_ITEMS: { label: string; icon: IconName }[] = [
  { label: 'Карточки', icon: 'Stars' },
  { label: 'Комиксы', icon: 'Characters' },
  { label: 'Грамматика', icon: 'CheckBox' },
];

// Mobile tab bar carries the brand mark on the flashcards tab instead of a
// separate logo header (there's no room for both on a small screen), and
// gets its own "Профиль" tab instead of a row at the top of Home.
const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: 'Chunki', logo: true },
  { label: 'Комиксы', icon: 'Characters' },
  { label: 'Грамматика', icon: 'CheckBox' },
  { label: 'Профиль', account: true },
];

function CheckingScreenForContext() {
  const ctx = useAppStore((s) => s.checkingContext);
  const title = ctx === 'exercise' ? 'Проверяем ваши упражнения' : 'Проверяем ваши ответы';
  return <CheckingScreen title={title} />;
}

function CurrentScreen() {
  const screen = useAppStore((s) => s.screen);
  const authChecked = useAppStore((s) => s.authChecked);
  const user = useAppStore((s) => s.user);
  // A confirmed-logged-out visitor (not just "haven't checked yet" — see the
  // authChecked guard) sees only the guest gallery, regardless of whatever
  // `screen` happens to be set to (e.g. left over from before signing out).
  if (authChecked && !user) return <GuestGalleryScreen />;
  switch (screen) {
    case 'goals':
      return <GoalsScreen />;
    case 'test':
      return <TestScreen />;
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
    case 'comics':
      return <ComicsScreen />;
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
      return <AdminScreen />;
    default:
      return <CardsScreen />;
  }
}

function SidebarNav({ value, onChange, onClose, overlay = false }: {
  value: number;
  onChange: (v: number) => void;
  onClose?: () => void;
  overlay?: boolean;
}) {
  const goHome = useAppStore((s) => s.goHome);
  const screen = useAppStore((s) => s.screen);
  const adminSection = useAppStore((s) => s.adminSection);
  const setAdminSection = useAppStore((s) => s.setAdminSection);
  const back = useAppStore((s) => s.back);
  const inAdmin = screen === 'admin';

  return (
    <nav aria-label="Боковое меню" className={`flex h-full w-full flex-col gap-1 overflow-y-auto bg-surface px-3 py-4 ${overlay ? 'touch-pan-y' : 'border-r border-border'}`}>
      <div className="mb-4 flex items-center gap-2">
        {overlay && <IconButton icon="Close" label="Свернуть меню" onClick={onClose} />}
        <button type="button" onClick={() => { goHome(); onClose?.(); }} className="pressable flex min-w-0 items-center gap-2 text-left">
          <Logo size={26} />
          <span className="text-[17px] font-semibold">Chunki</span>
        </button>
      </div>
      {inAdmin
        ? ADMIN_SECTIONS.map((item) => {
            const active = item.section === adminSection;
            return (
              <button
                key={item.section}
                type="button"
                onClick={() => { setAdminSection(item.section); onClose?.(); }}
                className={`pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left ${
                  active ? 'bg-accent-subtle text-accent' : 'text-text-secondary'
                }`}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
              </button>
            );
          })
        : SIDEBAR_ITEMS.map((item, i) => {
            const active = i === value;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => { onChange(i); onClose?.(); }}
                className={`pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left ${
                  active ? 'bg-accent-subtle text-accent' : 'text-text-secondary'
                }`}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
              </button>
            );
          })}
      <div className="flex-1" />
      {inAdmin && (
        <button type="button" onClick={() => { back(); onClose?.(); }} className="pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left text-text-secondary">
          <Icon name="ArrowBack" size={19} />
          Назад
        </button>
      )}
      <div className="border-t border-border pt-3">
        <AccountRow />
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

function navTabForScreen(screen: string): number {
  switch (screen) {
    case 'comics':
      return 1;
    case 'goals':
    case 'test':
    case 'checking':
    case 'result':
    case 'schedule':
    case 'paywall':
    case 'checkout':
    case 'program':
    case 'topic':
    case 'exercises':
    case 'topicresult':
      return 2;
    case 'cardslib':
    case 'deck':
    case 'deckdone':
    case 'recognitioncheck':
    case 'productioncheck':
    case 'dialogue':
    default:
      return 0;
  }
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const drawerGesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const screen = useAppStore((s) => s.screen);
  const navTab = useAppStore((s) => navTabForScreen(s.screen));
  const setNavTab = useAppStore((s) => s.setNavTab);
  const authChecked = useAppStore((s) => s.authChecked);
  const user = useAppStore((s) => s.user);
  // Same guard as CurrentScreen() — no nav chrome for a confirmed-logged-out
  // visitor (nowhere real for it to lead), but never during the brief
  // window before the initial checkAuth() resolves.
  const loggedOut = authChecked && !user;
  const studyGoal = useAppStore((s) => s.studyGoal);
  const completedIntroOwner = useAppStore((s) => s.completedIntroOwner);
  const showStudyGoal = user && screen !== 'deckdone' && !studyGoal?.dailyCardGoal
    && (studyGoal?.introCompleted || completedIntroOwner === user.id);

  useEffect(() => {
    consumeAuthToken();
    if (consumeAuthErrorFlag()) useAppStore.setState({ authError: true });
    useAppStore.getState().checkAuth();
    useAppStore.getState().loadCollections();
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)');
    const closeMobileMenu = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeMobileMenu);
    return () => desktop.removeEventListener('change', closeMobileMenu);
  }, []);

  useEffect(() => {
    if (!user || showStudyGoal) setSidebarOpen(false);
  }, [user, showStudyGoal]);

  const openSidebar = () => setSidebarOpen(true);

  return (
    <>
      {showStudyGoal ? <StudyGoalScreen key={user.id} /> : (
        <div className="h-dvh w-full flex justify-center bg-bg overflow-hidden">
          {!loggedOut && !sidebarCollapsed && (
            <div className="hidden w-[248px] flex-none min-[1200px]:block">
              <SidebarNav value={navTab} onChange={setNavTab} />
            </div>
          )}
          <div className={`w-full min-[768px]:max-w-[720px] ${loggedOut ? 'min-[1200px]:max-w-[1040px]' : 'min-[1200px]:max-w-[860px]'} h-dvh overflow-hidden flex flex-col`}>
            <SidebarMenuContext.Provider value={user ? { collapsed: sidebarCollapsed, toggle: () => setSidebarCollapsed((value) => !value) } : null}>
              <CurrentScreen />
            </SidebarMenuContext.Provider>
            {screen !== 'admin' && !loggedOut && (
              <div className="flex-none min-[1200px]:hidden">
                <BottomNavigation items={MOBILE_NAV_ITEMS} value={navTab} onChange={setNavTab} />
              </div>
            )}
          </div>
          {user && !sidebarOpen && <SidebarGesture onSwipe={openSidebar} />}
          {user && (
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
                  <Dialog.Title className="sr-only">Меню Chunki</Dialog.Title>
                  <SidebarNav value={navTab} onChange={setNavTab} onClose={() => setSidebarOpen(false)} overlay />
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
