import { useAppStore } from './store/appStore';
import { BottomNavigation } from './components/ui/BottomNavigation';
import { Icon, type IconName } from './components/ui/Icon';
import { Logo } from './components/brand/Logo';
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
import { DeckScreen } from './screens/DeckScreen';
import { DeckDoneScreen } from './screens/DeckDoneScreen';

const NAV_ITEMS: { label: string; icon: IconName }[] = [
  { label: 'Главная', icon: 'Today' },
  { label: 'Программа', icon: 'CheckBox' },
  { label: 'Карточки', icon: 'Stars' },
  { label: 'Доп. уроки', icon: 'Add' },
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
    case 'deck':
      return <DeckScreen />;
    case 'deckdone':
      return <DeckDoneScreen />;
    default:
      return <HomeScreen />;
  }
}

/** Persistent left rail — desktop only (>=1200px), replaces the bottom tab bar. */
function SidebarNav({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <nav className="hidden min-[1200px]:flex flex-col w-[248px] flex-none border-r border-border bg-surface px-3 py-8 gap-1">
      <div className="flex items-center gap-2 px-3 pb-6">
        <Logo size={26} />
        <span className="text-[17px] font-semibold">Chunki</span>
      </div>
      {NAV_ITEMS.map((item, i) => {
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
    </nav>
  );
}

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const navTab = useAppStore((s) => (s.screen === 'program' ? 1 : s.screen === 'extras' ? 3 : 0));
  const setNavTab = useAppStore((s) => s.setNavTab);
  const showNav = screen === 'home' || screen === 'program' || screen === 'extras';

  return (
    <div className="min-h-dvh w-full flex justify-center bg-bg">
      <SidebarNav value={navTab} onChange={setNavTab} />
      <div className="w-full min-[768px]:max-w-[720px] min-[1200px]:max-w-[860px] min-h-dvh flex flex-col">
        <CurrentScreen />
        {showNav && (
          <div className="min-[1200px]:hidden">
            <BottomNavigation items={NAV_ITEMS} value={navTab} onChange={setNavTab} />
          </div>
        )}
      </div>
    </div>
  );
}
