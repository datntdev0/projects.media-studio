import { useState } from 'react';

/** One field of a world-bible edit dialog. `rows` makes it a box, `options` a picker. */
export interface WorldEditField {
  key: string;
  label: string;
  value: string;
  hint?: string;
  rows?: number;
  options?: string[];
  optionLabel?(value: string): string;
}

interface WorldEditDialogProps {
  title: string;
  fields: WorldEditField[];
  onCancel(): void;
  onSave(values: Record<string, string>): void;
}

function initialValues(fields: WorldEditField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.value]));
}

/**
 * The one edit dialog every world-bible row opens. The tables show the merged
 * bible as it reads; changing an entry happens here, so a row stays a row rather
 * than a form.
 */
export function WorldEditDialog({ title, fields, onCancel, onSave }: WorldEditDialogProps) {
  const [values, setValues] = useState(() => initialValues(fields));
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <div className="dialog-backdrop" style={{ zIndex: 55 }}>
      <div className="dialog" style={{ width: 'min(560px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {fields.map((field) => (
            <div key={field.key} className="field" style={{ marginBottom: 13.6 }}>
              <label>{field.label}</label>
              {field.options ? (
                <select className="input" value={values[field.key]} onChange={(e) => set(field.key, e.target.value)}>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{field.optionLabel ? field.optionLabel(option) : option}</option>
                  ))}
                </select>
              ) : field.rows === undefined ? (
                <input className="input" value={values[field.key]} onChange={(e) => set(field.key, e.target.value)} />
              ) : (
                <textarea className="input" rows={field.rows} value={values[field.key]} onChange={(e) => set(field.key, e.target.value)} />
              )}
              {field.hint && <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{field.hint}</div>}
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(values)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
