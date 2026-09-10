import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Icon } from '../components/ui/Icon';

export function GrammarScreen() {
  const s = useAppStore();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Грамматика" onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 flex flex-col items-center justify-center gap-3 text-center">
        <Icon name="CheckBox" size={36} className="text-text-tertiary" />
        <div className="text-[16px] font-semibold">Раздел в разработке</div>
        <div className="text-body-secondary max-w-[280px]">Уроки грамматики и программа занятий скоро появятся здесь.</div>
      </div>
    </div>
  );
}
