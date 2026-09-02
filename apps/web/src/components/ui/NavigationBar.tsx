import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

/**
 * Top navigation bar. "small"/"center" put the title inline with the back
 * button (center = centered title, used on flows like the test); "large"
 * shows the title as a big page heading below the back button, for section
 * roots like Program/Extras.
 */
export function NavigationBar({
  title,
  size = 'small',
  onBack,
  hideBackOnDesktop = false,
}: {
  title?: ReactNode;
  size?: 'small' | 'center' | 'large';
  onBack?: () => void;
  /** Hide the back button at the >=1200px breakpoint, where the persistent
   * sidebar already offers the same destination (e.g. back-to-home). */
  hideBackOnDesktop?: boolean;
}) {
  const backSlotClass = hideBackOnDesktop ? 'min-[1200px]:hidden' : '';
  const back = onBack ? <IconButton icon="ArrowBack" label="Назад" onClick={onBack} /> : <span className="w-11 h-11 flex-none" />;

  if (size === 'large') {
    return (
      <div className="flex-none px-5 pt-2 pb-3">
        <div className={`flex items-center ${backSlotClass}`}>{back}</div>
        <div className="text-page-title mt-1">{title}</div>
      </div>
    );
  }

  return (
    <div className="flex-none h-14 px-2 flex items-center gap-1">
      <span className={backSlotClass}>{back}</span>
      <div className={`flex-1 text-[17px] font-semibold truncate ${size === 'center' ? 'text-center' : 'px-1'}`}>{title}</div>
      {size === 'center' ? <span className={`w-11 h-11 flex-none ${backSlotClass}`} /> : null}
    </div>
  );
}
