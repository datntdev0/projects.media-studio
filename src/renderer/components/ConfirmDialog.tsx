interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * In-app replacement for `window.confirm` — Electron's native confirm dialog can leave the
 * BrowserWindow unable to receive input focus afterward until it's minimized and restored.
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(400px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">{title}</div>
        <div className="text-muted" style={{ fontSize: 13 }}>{message}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" style={{ color: '#8a2f2f' }} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
