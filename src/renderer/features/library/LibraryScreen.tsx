import { useEffect, useMemo, useState } from 'react';
import { DownloadIcon, EditIcon, GridViewIcon, MoreVerticalIcon, PlusIcon, SearchIcon, TableViewIcon, TrashIcon } from '../../components/icons';
import { AppLibraryStatus, AppLibraryType, type AppLibrary } from '../../../shared/app-library';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppLibraries } from './useAppLibraries';
import { LibraryFormDialog } from './LibraryFormDialog';
import { LibraryDetailScreen } from './LibraryDetailScreen';
import { STATUS_TAG_CLASS, TYPE_LABEL, contentLabelOf, formatDate, progressPctOf, summaryOf } from './libraryFormat';

type ViewMode = 'table' | 'grid';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matchesQuery(item: AppLibrary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.novelMetadata?.author ?? ''].some((field) => field.toLowerCase().includes(needle));
}

export function LibraryScreen() {
  const { items, loading, error, filter, setFilter, create, update, remove, refresh, importPackage } = useAppLibraries();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [dialogItem, setDialogItem] = useState<AppLibrary | 'new' | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<AppLibrary | undefined>(undefined);
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState<string | undefined>(undefined);
  const [exportError, setExportError] = useState<string | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(undefined);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  const visibleItems = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query]);
  const activeItem = activeId === undefined ? undefined : items.find((item) => item.id === activeId);

  const handleDelete = async (item: AppLibrary) => {
    setRemoving(item.id);
    try {
      await remove(item.id);
      setActiveId(undefined);
    } finally {
      setRemoving(undefined);
    }
  };

  const handleExport = async (item: AppLibrary) => {
    setExporting(item.id);
    setExportError(undefined);
    try {
      await window.appLibraryPackageApi.exportZip(item.id);
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(undefined);
    }
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuFor((current) => (current === id ? undefined : id));
  };

  const renderMenu = (item: AppLibrary) =>
    menuFor === item.id && (
      <div className="blueprint row-menu">
        <button type="button" className="row-menu-item" onClick={() => setDialogItem(item)}>
          <EditIcon width={14} height={14} />
          Edit
        </button>
        <button type="button" className="row-menu-item" onClick={() => handleExport(item)} disabled={exporting === item.id}>
          <DownloadIcon width={14} height={14} />
          {exporting === item.id ? 'Exporting…' : 'Export .zip'}
        </button>
        <button type="button" className="row-menu-item is-danger" onClick={() => setConfirmDelete(item)} disabled={removing === item.id}>
          <TrashIcon width={14} height={14} />
          Delete
        </button>
      </div>
    );

  if (activeItem) {
    return (
      <>
        <LibraryDetailScreen
          item={activeItem}
          onBack={() => setActiveId(undefined)}
          onEdit={() => setDialogItem(activeItem)}
          onDelete={() => setConfirmDelete(activeItem)}
          onContentChange={refresh}
        />
        {dialogItem !== undefined && (
          <LibraryFormDialog item={dialogItem === 'new' ? undefined : dialogItem} onClose={() => setDialogItem(undefined)} onCreate={create} onUpdate={update} onImport={importPackage} />
        )}
        {confirmDelete && (
          <ConfirmDialog
            title="Delete library item"
            message={`Delete "${confirmDelete.title}"? This cannot be undone.`}
            onCancel={() => setConfirmDelete(undefined)}
            onConfirm={() => {
              handleDelete(confirmDelete);
              setConfirmDelete(undefined);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20.4, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, flexWrap: 'wrap' }}>
        <div className="seg">
          <label className="seg-opt">
            <input type="radio" name="ltype" checked={filter.type === undefined} onChange={() => setFilter({ ...filter, type: undefined })} />
            <span>All</span>
          </label>
          {Object.values(AppLibraryType).map((type) => (
            <label className="seg-opt" key={type}>
              <input type="radio" name="ltype" checked={filter.type === type} onChange={() => setFilter({ ...filter, type })} />
              <span>{TYPE_LABEL[type]}</span>
            </label>
          ))}
        </div>

        <div style={{ position: 'relative', width: 240 }}>
          <SearchIcon width={15} height={15} style={{ position: 'absolute', left: 9, top: 10, opacity: 0.45 }} />
          <input className="input" style={{ paddingLeft: 29 }} placeholder="Filter by title, author, source..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <select
          className="input"
          style={{ width: 130 }}
          value={filter.status ?? ''}
          onChange={(e) => setFilter({ ...filter, status: (e.target.value || undefined) as AppLibraryStatus | undefined })}
        >
          <option value="">Any status</option>
          {Object.values(AppLibraryStatus).map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', border: '1px solid var(--color-divider)' }}>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setView('table')}
              style={{
                width: 30,
                height: 30,
                border: 'none',
                borderRight: '1px solid var(--color-divider)',
                background: view === 'table' ? 'var(--color-accent)' : 'transparent',
                color: view === 'table' ? 'var(--color-bg)' : 'inherit',
              }}
              aria-label="Table view"
            >
              <TableViewIcon width={15} height={15} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setView('grid')}
              style={{
                width: 30,
                height: 30,
                border: 'none',
                background: view === 'grid' ? 'var(--color-accent)' : 'transparent',
                color: view === 'grid' ? 'var(--color-bg)' : 'inherit',
              }}
              aria-label="Grid view"
            >
              <GridViewIcon width={15} height={15} />
            </button>
          </div>
          <button className="btn btn-primary" type="button" style={{ gap: 6 }} onClick={() => setDialogItem('new')}>
            <PlusIcon width={15} height={15} />
            New item
          </button>
        </div>
      </div>

      {(error ?? exportError) && (
        <div className="text-muted" style={{ color: '#8a2f2f' }}>
          {error ?? exportError}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="blueprint" style={{ padding: 34, textAlign: 'center' }}>
          <div className="text-muted">{items.length === 0 ? 'No library items yet — add one to get started.' : 'No items match these filters.'}</div>
        </div>
      ) : view === 'table' ? (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '46%' }}>Item</th>
              <th style={{ width: '11%' }}>Type</th>
              <th style={{ width: '15%' }}>Content</th>
              <th style={{ width: '12%' }}>Status</th>
              <th style={{ width: '11%' }}>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setActiveId(item.id)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 46, flex: 'none', border: '1px solid var(--color-divider)', overflow: 'hidden' }}>
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div className="wireframe" style={{ width: '100%', height: '100%' }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{item.title}</div>
                      <div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {summaryOf(item)}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="tag tag-outline">{TYPE_LABEL[item.type]}</span>
                </td>
                <td style={{ fontSize: 13 }}>{contentLabelOf(item)}</td>
                <td>
                  <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{item.status}</span>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressPctOf(item)}%` }} />
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
      ) : (
        <div className="library-grid">
          {visibleItems.map((item) => (
            <div className="blueprint library-card" key={item.id} style={{ cursor: 'pointer' }} onClick={() => setActiveId(item.id)}>
              <div className={item.coverUrl ? 'library-card-cover' : 'wireframe library-card-cover'}>
                {item.coverUrl && (
                  <img src={item.coverUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <span className="tag tag-outline" style={{ position: 'absolute', top: 6, left: 6, background: 'var(--color-bg)' }}>
                  {TYPE_LABEL[item.type]}
                </span>
              </div>
              <div className="library-card-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>{item.title}</div>
                  <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 24, height: 24 }} onClick={(e) => toggleMenu(item.id, e)} aria-label="Actions">
                      <MoreVerticalIcon width={14} height={14} />
                    </button>
                    {renderMenu(item)}
                  </div>
                </div>
                <div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {summaryOf(item)}
                </div>
                <div>
                  <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{item.status}</span>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
                  <span>{contentLabelOf(item)}</span>
                  <span>{formatDate(item.updatedAt)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPctOf(item)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogItem !== undefined && (
        <LibraryFormDialog
          item={dialogItem === 'new' ? undefined : dialogItem}
          onClose={() => setDialogItem(undefined)}
          onCreate={create}
          onUpdate={update}
          onImport={importPackage}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete library item"
          message={`Delete "${confirmDelete.title}"? This cannot be undone.`}
          onCancel={() => setConfirmDelete(undefined)}
          onConfirm={() => {
            handleDelete(confirmDelete);
            setConfirmDelete(undefined);
          }}
        />
      )}
    </div>
  );
}
