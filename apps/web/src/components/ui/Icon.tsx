import {
  ArrowLeft,
  Check,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  X,
  Bookmark,
  Clock,
  Undo2,
  Play,
  PlusCircle,
  ChevronRight,
  AlarmClock,
  Trash2,
  Home,
  ListChecks,
  Sparkles,
  Plus,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  ArrowBack: ArrowLeft,
  Check,
  MoreHoriz: MoreHorizontal,
  KeyboardArrowUp: ChevronUp,
  KeyboardArrowDown: ChevronDown,
  Close: X,
  Bookmark,
  Snooze: Clock,
  Undo: Undo2,
  PlayArrowFilled: Play,
  AddCircle: PlusCircle,
  ChevronForward: ChevronRight,
  Alarm: AlarmClock,
  Delete: Trash2,
  Today: Home,
  CheckBox: ListChecks,
  Stars: Sparkles,
  Add: Plus,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, className = '', strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
