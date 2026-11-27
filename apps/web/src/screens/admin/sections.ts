import type { AdminSection } from '../../store/appStore';
import type { IconName } from '../../components/ui/Icon';

/** Single source of truth for the admin section list — shown in both the mobile menu (AdminScreen.tsx) and the desktop sidebar (App.tsx), which previously kept two independent copies. */
export const ADMIN_SECTIONS: { section: AdminSection; label: string; icon: IconName }[] = [
  { section: 'users', label: 'Пользователи', icon: 'Account' },
  { section: 'analytics', label: 'Аналитика', icon: 'Program' },
  { section: 'content', label: 'Контент', icon: 'Stars' },
  { section: 'characters', label: 'Персонажи', icon: 'Characters' },
  { section: 'program', label: 'Программа', icon: 'Program' },
  { section: 'curriculumModules', label: 'Учебные модули', icon: 'CheckBox' },
  { section: 'grammarTests', label: 'Тест грамматики', icon: 'CheckBox' },
  { section: 'payments', label: 'Платежи', icon: 'Payments' },
  { section: 'timecodes', label: 'Таймкоды', icon: 'Tags' },
  { section: 'chunkGroups', label: 'Типы', icon: 'Tags' },
  { section: 'aiLogs', label: 'AI-логи', icon: 'CheckBox' },
];
