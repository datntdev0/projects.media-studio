import { useEffect, useMemo, useState } from 'react';
import { EditIcon, MoreVerticalIcon, PlusIcon, SearchIcon, TrashIcon, WorkspacesIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AppLibraryType, type AppLibrary } from '@/shared/app-library';
import { WorkspacePreset, WorkspaceStatus, WorkspaceStepState, type AppWorkspace } from '@/shared/app-workspace';
import { formatDate } from '@/features/library/libraryFormat';
import { useAppLibraries } from '@/features/library/useAppLibraries';
import { useAppWorkspaces } from './useAppWorkspaces';
import { PRESETS, STATUS_LABEL, STATUS_TAG_CLASS, presetMetaOf, progressLabelOf, progressPctOf, stepTooltipOf } from './workspaceFormat';
import { WorkspaceFormDialog } from './WorkspaceFormDialog';
import { WorkspaceDetailScreen } from './WorkspaceDetailScreen';

const STEP_STATE_COLOR: Record<WorkspaceStepState, string> = {
  [WorkspaceStepState.Pending]: 'transparent',
  [WorkspaceStepState.Running]: 'var(--color-accent)',
  [WorkspaceStepState.Done]: 'var(--color-accent-700)',
  [WorkspaceStepState.Failed]: '#8a2f2f',
  [WorkspaceStepState.Skipped]: 'color-mix(in srgb, var(--color-text) 25%, transparent)',
};

function matchesQuery(workspace: AppWorkspace, novelTitle: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [workspace.name, novelTitle].some((field) => field.toLowerCase().includes(needle));
}

export function WorkspacesScreen() {
  const { items, totalCount, loading, error, filter, setFilter, create, update, remove } = useAppWorkspaces();
  const { items: libraries } = useAppLibraries();
  const [query, setQuery] = useState('');
  const [dialogItem, setDialogItem] = useState<AppWorkspace | 'new' | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<AppWorkspace | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(undefined);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  const novels = useMemo(() => libraries.filter((item) => item.type === AppLibraryType.Novel), [libraries]);
  const novelOf = (workspace: AppWorkspace): AppLibrary | undefined => libraries.find((item) => item.id === workspace.libraryId);
  const visibleItems = useMemo(() => items.filter((workspace) => matchesQuery(workspace, novelOf(workspace)?.title ?? '', query)), [items, libraries, query]);
  const activeWorkspace = activeId === undefined ? undefined : items.find((workspace) => workspace.id === activeId);

  const renderProgress = (workspace: AppWorkspace) => (
    <>
      <div style={{ display: 'flex', gap: 3 }}>
        {workspace.steps.map((step) => (
          <div
            key={step.key}
            title={stepTooltipOf(step)}
            style={{ flex: 1, height: 5, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)', position: 'relative' }}
          >
            <div style={{ position: 'absolute', inset: 0, width: `${progressPctOf(step)}%`, background: STEP_STATE_COLOR[step.state] }} />
          </div>
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{progressLabelOf(workspace)}</div>
    </>
  );

  if (activeWorkspace) {
    return <WorkspaceDetailScreen workspace={activeWorkspace} novel={novelOf(activeWorkspace)} onBack={() => setActiveId(undefined)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20.4, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 240 }}>
          <SearchIcon width={15} height={15} style={{ position: 'absolute', left: 9, top: 10, opacity: 0.45 }} />
          <input className="input" style={{ paddingLeft: 29 }} placeholder="Filter by name or novel..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <select
          className="input"
          style={{ width: 140 }}
          value={filter.status ?? ''}
          onChange={(e) => setFilter({ ...filter, status: e.target.value === '' ? undefined : (e.target.value as WorkspaceStatus) })}
        >
          <option value="">Any status</option>
          {Object.values(WorkspaceStatus).map((status) => (
            <option key={status} value={status}>{STATUS_LABEL[status]}</option>
          ))}
        </select>

        <select
          className="input"
          style={{ width: 150 }}
          value={filter.preset ?? ''}
          onChange={(e) => setFilter({ ...filter, preset: e.target.value === '' ? undefined : (e.target.value as WorkspacePreset) })}
        >
          <option value="">Any preset</option>
          {PRESETS.map(({ preset, title }) => (
            <option key={preset} value={preset}>{title}</option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {visibleItems.length} workspace{visibleItems.length === 1 ? '' : 's'}
          </span>
          <button className="btn btn-primary" type="button" style={{ gap: 6 }} onClick={() => setDialogItem('new')}>
            <PlusIcon width={15} height={15} />
            New workspace
          </button>
        </div>
      </div>

      {error && (
        <div className="text-muted" style={{ color: '#8a2f2f' }}>{error}</div>
      )}

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : totalCount === 0 ? (
        <div className="blueprint" style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10.2 }}>
          <WorkspacesIcon width={28} height={28} style={{ opacity: 0.45 }} />
          <h4 style={{ margin: 0 }}>No workspaces yet</h4>
          <div className="text-muted" style={{ fontSize: 13, maxWidth: 420, textWrap: 'pretty' }}>
            A workspace runs one preset pipeline over one library novel — analysis, optional translation, narration and export.
          </div>
          <button className="btn btn-primary" type="button" style={{ gap: 6, marginTop: 6.8 }} onClick={() => setDialogItem('new')}>
            <PlusIcon width={15} height={15} />
            New workspace
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="blueprint" style={{ padding: 34, textAlign: 'center' }}>
          <div className="text-muted">No workspaces match these filters.</div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Workspace</th>
              <th style={{ width: '17%' }}>Novel</th>
              <th style={{ width: '22%' }}>Pipeline progress</th>
              <th style={{ width: '11%' }}>Status</th>
              <th style={{ width: '13%' }}>Last run</th>
              <th style={{ width: '9%' }}>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((workspace) => {
              const novel = novelOf(workspace);
              return (
                <tr key={workspace.id} style={{ cursor: 'pointer' }} onClick={() => setActiveId(workspace.id)}>
                  <td>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{workspace.name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {[presetMetaOf(workspace.preset).title, workspace.description].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={novel?.coverUrl ? '' : 'wireframe'} style={{ width: 26, height: 36, flex: 'none', border: '1px solid var(--color-divider)', overflow: 'hidden' }}>
                        {novel?.coverUrl && <img src={novel.coverUrl} alt={novel.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </div>
                      <span style={{ fontSize: 13 }}>{novel?.title ?? 'Novel removed'}</span>
                    </div>
                  </td>
                  <td>{renderProgress(workspace)}</td>
                  <td>
                    <span className={`tag ${STATUS_TAG_CLASS[workspace.status]}`}>{STATUS_LABEL[workspace.status]}</span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{workspace.lastRunAt === null ? 'Never run' : formatDate(workspace.lastRunAt)}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{formatDate(workspace.updatedAt)}</td>
                  <td style={{ textAlign: 'right', position: 'relative' }}>
                    <button
                      className="btn btn-secondary btn-icon"
                      style={{ borderColor: 'transparent', width: 28, height: 28 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor((current) => (current === workspace.id ? undefined : workspace.id));
                      }}
                      aria-label="Actions"
                    >
                      <MoreVerticalIcon width={15} height={15} />
                    </button>
                    {menuFor === workspace.id && (
                      <div className="blueprint row-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="row-menu-item" onClick={() => setDialogItem(workspace)}>
                          <EditIcon width={14} height={14} />
                          Edit
                        </button>
                        <button type="button" className="row-menu-item is-danger" onClick={() => setConfirmDelete(workspace)}>
                          <TrashIcon width={14} height={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {dialogItem !== undefined && (
        <WorkspaceFormDialog
          workspace={dialogItem === 'new' ? undefined : dialogItem}
          novels={novels}
          onClose={() => setDialogItem(undefined)}
          onCreate={create}
          onUpdate={update}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete workspace"
          message={`Delete "${confirmDelete.name}"? The novel stays in the library.`}
          onCancel={() => setConfirmDelete(undefined)}
          onConfirm={() => {
            remove(confirmDelete.id);
            setConfirmDelete(undefined);
          }}
        />
      )}
    </div>
  );
}
