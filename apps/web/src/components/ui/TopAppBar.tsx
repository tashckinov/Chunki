import type { ReactNode } from 'react';

export function TopAppBar({
  title,
  size = 'small',
  onBack,
}: {
  title?: ReactNode;
  size?: 'small' | 'center' | 'medium';
  onBack?: () => void;
}) {
  const backBtn = onBack ? (
    <button type="button" className="icon-btn state-target" data-size="m" aria-label="Назад" onClick={onBack}>
      <span className="state-layer" />
      <span className="icon" aria-hidden="true">
        arrow_back
      </span>
    </button>
  ) : (
    <span className="w-12" />
  );

  if (size === 'medium') {
    return (
      <div className="appbar" data-size="medium">
        <div className="appbar-row">{backBtn}</div>
        <div className="appbar-headline">{title}</div>
      </div>
    );
  }

  return (
    <div className="appbar" data-size={size}>
      {backBtn}
      <div className="appbar-title">{title}</div>
      {size === 'center' ? <span className="w-12" /> : null}
    </div>
  );
}
