import { useState } from 'react';

interface ChapterFormDialogProps {
  nextNo: number;
  onClose(): void;
  onAdd(title: string): void;
}

export function ChapterFormDialog({ nextNo, onClose, onAdd }: ChapterFormDialogProps) {
  const [title, setTitle] = useState('');

  const handleAdd = () => {
    if (title.trim() === '') return;
    onAdd(title.trim());
  };

  return (
    <div className="dialog-backdrop" style={{ zIndex: 55 }}>
      <div className="dialog" style={{ width: 'min(480px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">Add chapter</div>
        <div className="dialog-body">
          <div className="field">
            <label>Chapter title</label>
            <input className="input" placeholder="Nine Bells for the Harbour" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 10.2 }}>
            It is numbered {nextNo} — one past the highest chapter stored — and starts empty; write it in the reader.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={title.trim() === ''}>Add chapter</button>
        </div>
      </div>
    </div>
  );
}
