import { useEffect, useMemo, useState } from 'react';
import { EditIcon, MoreVerticalIcon, PlusIcon, SearchIcon, TrashIcon } from '../../components/icons';
import { AppWorkflowStatus, type AppWorkflow } from '../../../shared/app-workflow';
import { TYPE_LABEL, formatDate } from '../library/libraryFormat';
import { useAppLibraries } from '../library/useAppLibraries';
import { useAppWorkflows } from './useAppWorkflows';
import { WorkflowFormDialog } from './WorkflowFormDialog';
import { WorkflowDetailScreen } from './WorkflowDetailScreen';
import { WorkflowHistoryScreen } from './WorkflowHistoryScreen';
import { STATUS_LABEL, STATUS_TAG_CLASS } from './workflowFormat';

function matchesQuery(item: AppWorkflow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.name, item.description, item.libraryTitle].some((field) => field.toLowerCase().includes(needle));
}

export function WorkflowScreen() {
  const { items, loading, error, filter, setFilter, create, update, remove, run } = useAppWorkflows();
  const { items: libraries } = useAppLibraries();
  const [query, setQuery] = useState('');
  const [dialogItem, setDialogItem] = useState<AppWorkflow | 'new' | undefined>(undefined);
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState<string | undefined>(undefined);
  const [runError, setRunError] = useState<string | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [historyId, setHistoryId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(undefined);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  const visibleItems = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query]);
  const activeItem = activeId === undefined ? undefined : items.find((item) => item.id === activeId);
  const historyItem = historyId === undefined ? undefined : items.find((item) => item.id === historyId);
  const libraryCovers = useMemo(() => new Map(libraries.map((library) => [library.id, library.coverUrl])), [libraries]);

  const handleDelete = async (item: AppWorkflow) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setRemoving(item.id);
    try {
      await remove(item.id);
      setActiveId(undefined);
    } finally {
      setRemoving(undefined);
    }
  };

  const handleRun = async (item: AppWorkflow) => {
    setRunning(item.id);
    setRunError(undefined);
    try {
      await run(item.id);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(undefined);
    }
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuFor((current) => (current === id ? undefined : id));
  };

  const renderMenu = (item: AppWorkflow) =>
    menuFor === item.id && (
      <div className="blueprint row-menu">
        <button type="button" className="row-menu-item" onClick={() => setDialogItem(item)}>
          <EditIcon width={14} height={14} />
          Edit
        </button>
        <button type="button" className="row-menu-item is-danger" onClick={() => handleDelete(item)} disabled={removing === item.id}>
          <TrashIcon width={14} height={14} />
          Delete
        </button>
      </div>
    );

  if (historyItem) {
    return <WorkflowHistoryScreen item={historyItem} onBack={() => setHistoryId(undefined)} />;
  }

  if (activeItem) {
    return (
      <>
        <WorkflowDetailScreen
          item={activeItem}
          onBack={() => setActiveId(undefined)}
          onEdit={() => setDialogItem(activeItem)}
          onDelete={() => handleDelete(activeItem)}
          onRun={() => handleRun(activeItem)}
          onHistory={() => setHistoryId(activeItem.id)}
          running={running === activeItem.id || activeItem.status === AppWorkflowStatus.Running}
          runError={runError}
        />
        {dialogItem !== undefined && (
          <WorkflowFormDialog item={dialogItem === 'new' ? undefined : dialogItem} onClose={() => setDialogItem(undefined)} onCreate={create} onUpdate={update} />
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20.4, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, flexWrap: 'wrap' }}>
        <div className="seg">
          <label className="seg-opt">
            <input type="radio" name="wstatus" checked={filter.status === undefined} onChange={() => setFilter({ ...filter, status: undefined })} />
            <span>All</span>
          </label>
          {Object.values(AppWorkflowStatus).map((status) => (
            <label className="seg-opt" key={status}>
              <input type="radio" name="wstatus" checked={filter.status === status} onChange={() => setFilter({ ...filter, status })} />
              <span>{STATUS_LABEL[status]}</span>
            </label>
          ))}
        </div>

        <div style={{ position: 'relative', width: 280 }}>
          <SearchIcon width={15} height={15} style={{ position: 'absolute', left: 9, top: 10, opacity: 0.45 }} />
          <input className="input" style={{ paddingLeft: 29 }} placeholder="Filter by name or description..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {visibleItems.length} workflow{visibleItems.length === 1 ? '' : 's'}
          </span>
          <button className="btn btn-primary" type="button" style={{ gap: 6 }} onClick={() => setDialogItem('new')}>
            <PlusIcon width={15} height={15} />
            New workflow
          </button>
        </div>
      </div>

      {error && (
        <div className="text-muted" style={{ color: '#8a2f2f' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="blueprint" style={{ padding: 34, textAlign: 'center' }}>
          <div className="text-muted">{items.length === 0 ? 'No workflows yet — create one to get started.' : 'No workflows match these filters.'}</div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Status</th>
              <th style={{ width: '40%' }}>Workflow</th>
              <th style={{ width: '25%' }}>Library</th>
              <th style={{ width: '15%' }}>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setActiveId(item.id)}>
                <td>
                  <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                </td>
                <td>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                  <div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 26, height: 34, flex: 'none', border: '1px solid var(--color-divider)', overflow: 'hidden' }}>
                      {libraryCovers.get(item.libraryId) ? (
                        <img src={libraryCovers.get(item.libraryId)!} alt={item.libraryTitle} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div className="wireframe" style={{ width: '100%', height: '100%' }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.libraryTitle}</div>
                      <span className="tag tag-outline" style={{ fontSize: 10 }}>
                        {TYPE_LABEL[item.libraryType]}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="text-muted" style={{ fontSize: 12 }}>
                  {formatDate(item.updatedAt)}
                </td>
                <td style={{ textAlign: 'right', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 28, height: 28 }} onClick={(e) => toggleMenu(item.id, e)} aria-label="Actions">
                    <MoreVerticalIcon width={15} height={15} />
                  </button>
                  {renderMenu(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialogItem !== undefined && (
        <WorkflowFormDialog item={dialogItem === 'new' ? undefined : dialogItem} onClose={() => setDialogItem(undefined)} onCreate={create} onUpdate={update} />
      )}
    </div>
  );
}
