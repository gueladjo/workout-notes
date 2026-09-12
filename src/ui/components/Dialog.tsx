import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/**
 * Modal dialog on top of the native <dialog> element (focus trapping, Escape, backdrop for free).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  wide,
  flush,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  flush?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (outside the dialog box) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          {title && <div className="dialog__title">{title}</div>}
          <div className={`dialog__body${flush ? ' dialog__body--flush' : ''}`}>{children}</div>
          {actions && <div className="dialog__actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}

/** Yes/no confirmation. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}
