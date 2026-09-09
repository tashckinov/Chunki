import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Sheet } from '../../components/ui/Sheet';
import { Icon, type IconName } from '../../components/ui/Icon';
import { UsersSection } from './UsersSection';
import { ContentSection } from './ContentSection';
import { CharactersSection } from './CharactersSection';
import { AiLogsSection } from './AiLogsSection';

const SECTIONS: { section: 'users' | 'content' | 'characters' | 'aiLogs'; label: string; icon: IconName }[] = [
  { section: 'users', label: 'Пользователи', icon: 'Account' },
  { section: 'content', label: 'Контент', icon: 'Stars' },
  { section: 'characters', label: 'Персонажи', icon: 'Characters' },
  { section: 'aiLogs', label: 'AI-логи', icon: 'CheckBox' },
];

export function AdminScreen() {
  const user = useAppStore((s) => s.user);
  const goHome = useAppStore((s) => s.goHome);
  const back = useAppStore((s) => s.back);
  const adminSection = useAppStore((s) => s.adminSection);
  const setAdminSection = useAppStore((s) => s.setAdminSection);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (user && !user.isAdmin) goHome();
  }, [user, goHome]);

  if (!user?.isAdmin) return null;

  const openMenu = () => setMenuOpen(true);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {adminSection === 'users' ? (
        <UsersSection onOpenMenu={openMenu} />
      ) : adminSection === 'content' ? (
        <ContentSection onOpenMenu={openMenu} />
      ) : adminSection === 'characters' ? (
        <CharactersSection onOpenMenu={openMenu} />
      ) : (
        <AiLogsSection onOpenMenu={openMenu} />
      )}

      {/* Mobile-only: desktop switches sections via the persistent sidebar instead (see App.tsx). */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Админка">
        <div className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.section}
              type="button"
              onClick={() => {
                setAdminSection(s.section);
                setMenuOpen(false);
              }}
              className={`pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left ${
                s.section === adminSection ? 'bg-accent-subtle text-accent' : 'text-text-secondary'
              }`}
            >
              <Icon name={s.icon} size={19} />
              {s.label}
            </button>
          ))}
          <div className="border-t border-border mt-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                back();
              }}
              className="pressable flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14.5px] font-medium text-left text-text-secondary"
            >
              <Icon name="ArrowBack" size={19} />
              Назад к приложению
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
