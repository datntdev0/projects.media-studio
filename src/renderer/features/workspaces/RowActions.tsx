import { EditIcon, TrashIcon } from '@/components/icons';

interface RowActionsProps {
  onEdit(): void;
  /** Left out for a row that mirrors something else and so cannot be removed on its own. */
  onRemove?(): void;
}

/** The controls at the end of a world-bible row. */
export function RowActions({ onEdit, onRemove }: RowActionsProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
      <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Edit" onClick={onEdit}>
        <EditIcon width={14} height={14} />
      </button>
      {onRemove && (
        <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Remove" onClick={onRemove}>
          <TrashIcon width={14} height={14} />
        </button>
      )}
    </div>
  );
}
