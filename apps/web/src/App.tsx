import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { consumeAuthErrorFlag, consumeAuthToken } from './lib/auth';
import { BottomNavigation, type NavItem } from './components/ui/BottomNavigation';
import { Icon, type IconName } from './components/ui/Icon';
import { Logo } from './components/brand/Logo';
import { AccountRow } from './components/ui/AccountRow';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { GoalsScreen } from './screens/GoalsScreen';
import { TestScreen } from './screens/TestScreen';
import { CheckingScreen } from './screens/CheckingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { PaywallScreen } from './screens/PaywallScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProgramScreen } from './screens/ProgramScreen';
import { TopicScreen } from './screens/TopicScreen';
import { ExercisesScreen } from './screens/ExercisesScreen';
import { TopicResultScreen } from './screens/TopicResultScreen';
import { ExtrasScreen } from './screens/ExtrasScreen';
import { CardsScreen } from './screens/CardsScreen';
import { DeckScreen } from './screens/DeckScreen';
import { DeckDoneScreen } from './screens/DeckDoneScreen';
import { RecognitionCheckScreen } from './screens/RecognitionCheckScreen';
import { ProductionCheckScreen } from './screens/ProductionCheckScreen';
import { AdminScreen } from './screens/admin/AdminScreen';

const SIDEBAR_ITEMS: { label: string; icon: IconName }[] = [
  { label: 'Главная', icon: 'Today' },
  { label: 'Программа', icon: 'CheckBox' },
  { label: 'Карточки', icon: 'Stars' },
  { label: 'Доп. уроки', icon: 'Add' },
];

const ADMIN_SIDEBAR_ITEMS: { label: string; icon: IconName; section: 'users' | 'content' | 'characters' | 'aiLogs' }[] = [
  { label: 'Пользователи', icon: 'Account', section: 'users' },
  { label: 'Контент', icon: 'Stars', section: 'content' },
  { label: 'Персонажи', icon: 'Characters', section: 'characters' },
  { label: 'AI-логи', icon: 'CheckBox', section: 'aiLogs' },
];

// Mobile tab bar carries the brand mark on the flashcards tab instead of a
// separate logo header (there's no room for both on a small screen), and
// gets its own "Профиль" tab instead of a row at the top of Home.
const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: 'Главная', icon: 'Today' },
  { label: 'Программа', icon: 'CheckBox' },
  { label: 'Chunki', logo: true },
  { label: 'Доп. уроки', icon: 'Add' },
  { label: 'Профиль', account: true },
];

function CheckingScreenForContext() {
  const ctx = useAppStore((s) => s.checkingContext);
  const title = ctx === 'exercise' ? 'Проверяем ваши упражнения' : 'Проверяем ваши ответы';
  return <CheckingScreen title={title} />;
}

function CurrentScreen() {
  const screen = useAppStore((s) => s.screen);
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
    case 'home':
      return <HomeScreen />;
    case 'program':
      return <ProgramScreen />;
    case 'topic':
      return <TopicScreen />;
    case 'exercises':
      return <ExercisesScreen />;
    case 'topicresult':
      return <TopicResultScreen />;
    case 'extras':
      return <ExtrasScreen />;
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
    case 'admin':
      return <AdminScreen />;
    default:
      return <HomeScreen />;
  }
}

/** Persistent left rail — desktop only (>=1200px), replaces the bottom tab bar.
 * While screen === 'admin', it swaps to the admin section list (with a
 * "Назад" item back to the normal app) instead of the regular nav items. */
function SidebarNav({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const goHome = useAppStore((s) => s.goHome);
  const screen = useAppStore((s) => s.screen);
  const adminSection = useAppStore((s) => s.adminSection);
  const setAdminSection = useAppStore((s) => s.setAdminSection);
  const back = useAppStore((s) => s.back);
  const inAdmin = screen === 'admin';

  return (
    <nav className="hidden min-[1200px]:flex flex-col w-[248px] flex-none overflow-y-auto border-r border-border bg-surface px-3 py-8 gap-1">
      <button type="button" onClick={goHome} className="pressable flex items-center gap-2 px-3 pb-6 text-left">
        <Logo size={26} />
        <span className="text-[17px] font-semibold">Chunki</span>
      </button>
      {inAdmin
        ? ADMIN_SIDEBAR_ITEMS.map((item) => {
            const active = item.section === adminSection;
            return (
              <button
                key={item.section}
                type="button"
                onClick={() => setAdminSection(item.section)}
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
                onClick={() => onChange(i)}
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
        <button type="button" onClick={back} className="pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left text-text-secondary">
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

function navTabForScreen(screen: string): number {
  switch (screen) {
    case 'program':
      return 1;
    case 'cardslib':
    case 'deck':
    case 'deckdone':
    case 'recognitioncheck':
    case 'productioncheck':
      return 2;
    case 'extras':
      return 3;
    default:
      return 0;
  }
}

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const navTab = useAppStore((s) => navTabForScreen(s.screen));
  const setNavTab = useAppStore((s) => s.setNavTab);

  useEffect(() => {
    consumeAuthToken();
    if (consumeAuthErrorFlag()) useAppStore.setState({ authError: true });
    useAppStore.getState().checkAuth();
    useAppStore.getState().loadCollections();
  }, []);

  return (
    <div className="h-dvh w-full flex justify-center bg-bg overflow-hidden">
      <SidebarNav value={navTab} onChange={setNavTab} />
      <div className="w-full min-[768px]:max-w-[720px] min-[1200px]:max-w-[860px] h-dvh overflow-hidden flex flex-col">
        <CurrentScreen />
        {screen !== 'admin' && (
          <div className="flex-none min-[1200px]:hidden">
            <BottomNavigation items={MOBILE_NAV_ITEMS} value={navTab} onChange={setNavTab} />
          </div>
        )}
      </div>
      <UpdatePrompt />
    </div>
  );
}
