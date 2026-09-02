const LIGATURES = {
  ArrowBack: 'arrow_back',
  Check: 'check',
  MoreHoriz: 'more_horiz',
  KeyboardArrowUp: 'keyboard_arrow_up',
  KeyboardArrowDown: 'keyboard_arrow_down',
  Close: 'close',
  Bookmark: 'bookmark',
  Snooze: 'snooze',
  Undo: 'undo',
  PlayArrowFilled: 'play_arrow',
  AddCircle: 'add_circle',
  ChevronForward: 'chevron_right',
  Alarm: 'alarm',
  Delete: 'delete',
  Today: 'today',
  CheckBox: 'check_box',
  Stars: 'stars',
  Add: 'add',
} as const;

export type IconName = keyof typeof LIGATURES;

export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  const filled = name === 'PlayArrowFilled';
  return (
    <span
      className={`icon ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}` }}
      aria-hidden="true"
    >
      {LIGATURES[name]}
    </span>
  );
}
