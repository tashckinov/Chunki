import { useAppStore } from './store/appStore';
import { NavigationBar } from './components/ui/NavigationBar';
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

const NAV_ITEMS = [
  { label: 'Главная', icon: 'Today' as const },
  { label: 'Программа', icon: 'CheckBox' as const },
  { label: 'Карточки', icon: 'Stars' as const },
  { label: 'Доп. уроки', icon: 'Add' as const },
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

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const navTab = useAppStore((s) => (s.screen === 'program' ? 1 : s.screen === 'extras' ? 3 : 0));
  const setNavTab = useAppStore((s) => s.setNavTab);
  const showNav = screen === 'home' || screen === 'program' || screen === 'extras';

  return (
    <div className="min-h-dvh w-full flex justify-center bg-surface-dim">
      <div className="w-full max-w-[480px] min-h-dvh bg-surface flex flex-col md:my-6 md:min-h-[calc(100dvh-48px)] md:rounded-3xl md:shadow-xl overflow-hidden">
        <CurrentScreen />
        {showNav && <NavigationBar items={NAV_ITEMS} value={navTab} onChange={setNavTab} />}
      </div>
    </div>
  );
}
