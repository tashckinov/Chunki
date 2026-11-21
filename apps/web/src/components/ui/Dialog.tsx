import type { ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';

export function Dialog({
  open,
  onOpenChange,
  headline,
  children,
  actions = null,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headline: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-30 bg-[color:var(--tok-scrim)]" />
        <BaseDialog.Popup className={`anim-rise fixed z-30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-48px)] max-w-[340px] max-h-[calc(100dvh-32px)] overflow-y-auto flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-6 shadow-[var(--shadow-md)] ${className}`}>
          <BaseDialog.Title className="text-section-title">{headline}</BaseDialog.Title>
          <div className="text-body-secondary">{children}</div>
          {actions ? <div className="flex justify-end gap-2 pt-1">{actions}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
