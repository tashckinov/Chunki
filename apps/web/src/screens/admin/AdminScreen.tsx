import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { UsersSection } from './UsersSection';
import { ContentSection } from './ContentSection';
import { CharactersSection } from './CharactersSection';
import { AiLogsSection } from './AiLogsSection';
import { TimecodesSection } from './TimecodesSection';
import { PaymentsSection } from './PaymentsSection';
import { GrammarTestsSection } from './GrammarTestsSection';
import { CurriculumModulesSection } from './CurriculumModulesSection';
import { ProgramSection } from './ProgramSection';
import { ChunkGroupsSection } from './ChunkGroupsSection';

export function AdminScreen({ onOpenMenu }: { onOpenMenu: () => void }) {
  const user = useAppStore((s) => s.user);
  const goHome = useAppStore((s) => s.goHome);
  const adminSection = useAppStore((s) => s.adminSection);

  useEffect(() => {
    if (user && !user.isAdmin) goHome();
  }, [user, goHome]);

  if (!user?.isAdmin) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {adminSection === 'users' ? (
        <UsersSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'content' ? (
        <ContentSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'characters' ? (
        <CharactersSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'program' ? (
        <ProgramSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'curriculumModules' ? (
        <CurriculumModulesSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'grammarTests' ? (
        <GrammarTestsSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'payments' ? (
        <PaymentsSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'timecodes' ? (
        <TimecodesSection onOpenMenu={onOpenMenu} />
      ) : adminSection === 'chunkGroups' ? (
        <ChunkGroupsSection onOpenMenu={onOpenMenu} />
      ) : (
        <AiLogsSection onOpenMenu={onOpenMenu} />
      )}

    </div>
  );
}
