import { useMemo, useState } from 'react';
import { CheckIcon } from '../../components/icons';
import { AppWorkflowStatus, type AppWorkflow, type CreateAppWorkflowInput, type UpdateAppWorkflowInput } from '../../../shared/app-workflow';
import { AppLibraryType, type AppLibrary } from '../../../shared/app-library';
import { TYPE_LABEL, summaryOf } from '../library/libraryFormat';
import { useAppLibraries } from '../library/useAppLibraries';
import { EDITABLE_STATUSES, STATUS_LABEL } from './workflowFormat';

interface WorkflowFormDialogProps {
  /** Present in edit mode — the workflow's library stays fixed, only its own fields are shown. */
  item?: AppWorkflow;
  onClose(): void;
  onCreate(input: CreateAppWorkflowInput): Promise<unknown>;
  onUpdate(id: string, input: UpdateAppWorkflowInput): Promise<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matchesQuery(item: AppLibrary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.sourceName].some((field) => field.toLowerCase().includes(needle));
}

export function WorkflowFormDialog({ item, onClose, onCreate, onUpdate }: WorkflowFormDialogProps) {
  const isEdit = item !== undefined;

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [status, setStatus] = useState<AppWorkflowStatus>(item && EDITABLE_STATUSES.includes(item.status) ? item.status : AppWorkflowStatus.Draft);
  const [libraryId, setLibraryId] = useState<string | undefined>(undefined);
  const [libraryQuery, setLibraryQuery] = useState('');

  const { items: libraries, loading: librariesLoading, filter: libraryFilter, setFilter: setLibraryFilter } = useAppLibraries();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const visibleLibraries = useMemo(() => libraries.filter((library) => matchesQuery(library, libraryQuery)), [libraries, libraryQuery]);

  const nameValid = name.trim() !== '';
  const canSubmit = isEdit ? nameValid : nameValid && libraryId !== undefined;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(undefined);

    try {
      if (isEdit) {
        await onUpdate(item.id, { name: name.trim(), description: description.trim(), status });
      } else {
        if (!libraryId) throw new Error('Choose a library for this workflow.');
        await onCreate({ name: name.trim(), description: description.trim(), status, libraryId });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(560px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">{isEdit ? 'Edit workflow' : 'New workflow'}</div>
        <div className="text-muted" style={{ fontSize: 12, margin: '-4px 0 13.6px' }}>
          What this workflow produces, and for which library entity.
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 13.6, maxHeight: '64vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 13.6 }}>
            <div className="field" style={{ flex: 1, minWidth: 0 }}>
              <label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Novel localisation — Vietnamese" />
            </div>
            <div className="field" style={{ width: 132, flex: 'none' }}>
              <label>Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AppWorkflowStatus)} style={{ cursor: 'pointer' }}>
                {EDITABLE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              className="input"
              style={{ minHeight: 74 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this workflow produces, and for which library entity."
            />
          </div>

          <div className="field">
            <label>Library</label>
            {isEdit ? (
              <div className="blueprint" style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}>{item.libraryTitle}</div>
                <span className="tag tag-outline">{TYPE_LABEL[item.libraryType]}</span>
              </div>
            ) : (
              <>
                <div className="seg" style={{ marginBottom: 8, width: '100%' }}>
                  <label className="seg-opt" style={{ flex: 1 }}>
                    <input type="radio" name="wlibf" checked={libraryFilter.type === undefined} onChange={() => setLibraryFilter({ ...libraryFilter, type: undefined })} />
                    <span>All</span>
                  </label>
                  {Object.values(AppLibraryType).map((type) => (
                    <label className="seg-opt" style={{ flex: 1 }} key={type}>
                      <input type="radio" name="wlibf" checked={libraryFilter.type === type} onChange={() => setLibraryFilter({ ...libraryFilter, type })} />
                      <span>{TYPE_LABEL[type]}</span>
                    </label>
                  ))}
                </div>
                <input
                  className="input"
                  style={{ marginBottom: 8 }}
                  placeholder="Filter by title or source..."
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                  {librariesLoading ? (
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Loading…
                    </div>
                  ) : visibleLibraries.length === 0 ? (
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      No library items match.
                    </div>
                  ) : (
                    visibleLibraries.map((library) => (
                      <div
                        key={library.id}
                        className="blueprint"
                        onClick={() => setLibraryId(library.id)}
                        style={{
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          background: libraryId === library.id ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                        }}
                      >
                        <span style={{ width: 14, flex: 'none', opacity: libraryId === library.id ? 1 : 0 }}>
                          <CheckIcon width={14} height={14} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{library.title}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {summaryOf(library)}
                          </div>
                        </div>
                        <span className="tag tag-outline">{TYPE_LABEL[library.type]}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                  A workflow's library can't be changed after it's created.
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="text-muted" style={{ color: '#8a2f2f', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {isEdit ? 'Save changes' : 'Create workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}
