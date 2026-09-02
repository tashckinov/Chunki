import type { ReactNode } from 'react';

export function Dialog({ headline, children, actions }: { headline: ReactNode; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="scrim">
      <div className="dialog" role="alertdialog" aria-modal="true">
        <div className="dialog-headline">{headline}</div>
        <div className="text-sm leading-5">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
