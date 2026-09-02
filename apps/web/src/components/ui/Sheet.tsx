import type { ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';

/** A bottom sheet — same modal semantics as Dialog, anchored to the bottom edge. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-30 bg-[color:var(--tok-scrim)]" />
        <BaseDialog.Popup className="anim-rise fixed z-30 inset-x-0 bottom-0 mx-auto w-full max-w-[520px] rounded-t-[var(--radius-lg)] bg-surface p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[var(--shadow-md)] max-h-[85vh] overflow-y-auto">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border-strong" />
          {title ? <BaseDialog.Title className="text-section-title mb-3">{title}</BaseDialog.Title> : null}
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
