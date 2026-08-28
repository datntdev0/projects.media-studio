import { useEffect, useMemo, useRef, useState } from 'react';
import { EditIcon, LayoutGridIcon, MaximizeIcon, MinusIcon, PlusIcon, TrashIcon } from '../../components/icons';
import type { AppWorkflow } from '../../../shared/app-workflow';
import { AppWorkflowActivityType, type AppWorkflowActivity, type CreateAppWorkflowActivityInput, type UpdateAppWorkflowActivityInput } from '../../../shared/app-workflow-activity';
import { AppLibraryContentType, type AppLibraryContent } from '../../../shared/app-library-content';
import { AppLibraryType } from '../../../shared/app-library';
import { WorkflowActivityInspector } from './WorkflowActivityInspector';
import { ACTIVITY_TYPES_BY_LIBRARY, ACTIVITY_TYPE_META, defaultConfigFor, summaryFor } from './workflowActivityFormat';
import { TYPE_LABEL } from '../library/libraryFormat';

interface WorkflowCanvasProps {
  workflow: AppWorkflow;
  activities: AppWorkflowActivity[];
  loading: boolean;
  add(input: CreateAppWorkflowActivityInput): AppWorkflowActivity;
  patch(id: string, input: UpdateAppWorkflowActivityInput): void;
  remove(id: string): void;
  moveMany(positions: { id: string; x: number; y: number }[]): void;
  onEdit(): void;
  onDelete(): void;
}

const NODE_W = 212;
const PORT_Y = 32;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;

type DragState =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: 'link'; fromId: string };

function edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

export function WorkflowCanvas({ workflow, activities, loading, add: addActivityDraft, patch, remove, moveMany, onEdit, onDelete }: WorkflowCanvasProps) {
  const [contents, setContents] = useState<AppLibraryContent[]>([]);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedEdge, setSelectedEdge] = useState<{ fromId: string; toId: string } | undefined>(undefined);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(0.85);
  const [linkTo, setLinkTo] = useState<{ x: number; y: number } | undefined>(undefined);
  const [overlay, setOverlay] = useState<{ id: string; x: number; y: number } | undefined>(undefined);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (workflow.libraryType !== AppLibraryType.Novel) {
      setContents([]);
      setDiscoveredCount(0);
      return;
    }
    window.appLibraryContentApi.list(workflow.libraryId, { type: AppLibraryContentType.Original }).then(setContents);
    window.appLibraryApi.get(workflow.libraryId).then((library) => setDiscoveredCount(library?.novelMetadata?.discoveredCount ?? 0));
  }, [workflow.libraryId, workflow.libraryType]);

  const paletteTypes = ACTIVITY_TYPES_BY_LIBRARY[workflow.libraryType];
  const selected = selectedId === undefined ? undefined : activities.find((a) => a.id === selectedId);

  const positionOf = (activity: AppWorkflowActivity) => (overlay?.id === activity.id ? overlay : { x: activity.x, y: activity.y });

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: Math.round((clientX - rect.left - pan.x) / zoom), y: Math.round((clientY - rect.top - pan.y) / zoom) };
  };

  const fit = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || activities.length === 0) return;
    const x0 = Math.min(...activities.map((a) => a.x));
    const y0 = Math.min(...activities.map((a) => a.y));
    const x1 = Math.max(...activities.map((a) => a.x + NODE_W));
    const y1 = Math.max(...activities.map((a) => a.y + 120));
    const z = Math.min(1.2, Math.max(MIN_ZOOM, Math.min((rect.width - 100) / (x1 - x0), (rect.height - 100) / (y1 - y0))));
    setZoom(z);
    setPan({ x: (rect.width - (x1 - x0) * z) / 2 - x0 * z, y: (rect.height - (y1 - y0) * z) / 2 - y0 * z });
  };

  useEffect(() => {
    if (fittedRef.current || activities.length === 0) return;
    fittedRef.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities.length]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === 'pan') {
        setPan({ x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) });
      } else if (drag.mode === 'node') {
        const nx = drag.ox + (e.clientX - drag.sx) / zoom;
        const ny = drag.oy + (e.clientY - drag.sy) / zoom;
        drag.moved = true;
        setOverlay({ id: drag.id, x: Math.round(nx), y: Math.round(ny) });
      } else if (drag.mode === 'link') {
        setLinkTo(toCanvas(e.clientX, e.clientY));
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = undefined;
      if (!drag) return;
      if (drag.mode === 'node' && drag.moved) {
        const nx = drag.ox + (e.clientX - drag.sx) / zoom;
        const ny = drag.oy + (e.clientY - drag.sy) / zoom;
        patch(drag.id, { x: Math.round(nx), y: Math.round(ny) });
      }
      setOverlay(undefined);
      if (drag.mode === 'link') {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const hostId = el instanceof Element ? el.closest('[data-activity-id]')?.getAttribute('data-activity-id') : undefined;
        setLinkTo(undefined);
        if (hostId && hostId !== drag.fromId) {
          const target = activities.find((a) => a.id === hostId);
          if (target && !target.dependencies.includes(drag.fromId)) {
            patch(hostId, { dependencies: [...target.dependencies, drag.fromId] });
          }
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, activities, patch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selectedEdge) {
        const target = activities.find((a) => a.id === selectedEdge.toId);
        if (target) patch(target.id, { dependencies: target.dependencies.filter((id) => id !== selectedEdge.fromId) });
        setSelectedEdge(undefined);
      } else if (selectedId) {
        remove(selectedId);
        setSelectedId(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdge, selectedId, activities, patch, remove]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY > 0 ? 0.92 : 1.08)));
      const k = next / z;
      setPan((p) => ({ x: mx - (mx - p.x) * k, y: my - (my - p.y) * k }));
      return next;
    });
  };

  const zoomBy = (factor: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));

  const startPan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    setSelectedId(undefined);
    setSelectedEdge(undefined);
    dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
  };

  const startNodeDrag = (activity: AppWorkflowActivity, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedId(activity.id);
    setSelectedEdge(undefined);
    dragRef.current = { mode: 'node', id: activity.id, sx: e.clientX, sy: e.clientY, ox: activity.x, oy: activity.y, moved: false };
  };

  const startLink = (activity: AppWorkflowActivity, e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { mode: 'link', fromId: activity.id };
    const pos = positionOf(activity);
    setLinkTo({ x: pos.x + NODE_W, y: pos.y + PORT_Y });
  };

  const addActivity = (type: AppWorkflowActivityType) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect ? toCanvas(rect.left + rect.width / 2 - NODE_W / 2, rect.top + rect.height / 2 - 40) : { x: 40, y: 40 };
    const created = addActivityDraft({ type, name: ACTIVITY_TYPE_META[type].label, x: center.x, y: center.y, config: defaultConfigFor(type) });
    setSelectedId(created.id);
  };

  const tidyUp = () => {
    const deg = new Map(activities.map((a) => [a.id, 0]));
    const adj = new Map(activities.map((a) => [a.id, [] as string[]]));
    activities.forEach((a) => a.dependencies.forEach((depId) => {
      deg.set(a.id, (deg.get(a.id) ?? 0) + 1);
      adj.get(depId)?.push(a.id);
    }));
    const queue = activities.filter((a) => (deg.get(a.id) ?? 0) === 0).map((a) => a.id);
    const depth = new Map<string, number>();
    queue.forEach((id) => depth.set(id, 0));
    const order = [...queue];
    while (order.length) {
      const id = order.shift()!;
      for (const next of adj.get(id) ?? []) {
        depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1));
        deg.set(next, (deg.get(next) ?? 0) - 1);
        if (deg.get(next) === 0) order.push(next);
      }
    }
    const columns = new Map<number, number>();
    moveMany(
      activities.map((a) => {
        const layer = depth.get(a.id) ?? 0;
        const row = columns.get(layer) ?? 0;
        columns.set(layer, row + 1);
        return { id: a.id, x: layer * (NODE_W + 60), y: row * 140 };
      }),
    );
  };

  const edges = useMemo(
    () => activities.flatMap((activity) => activity.dependencies.map((fromId) => ({ fromId, toId: activity.id }))).filter((e) => activities.some((a) => a.id === e.fromId)),
    [activities],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: 236, flex: 'none', borderRight: '1px solid var(--color-divider)', paddingRight: '10.2px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div>
            <div className="card-kicker">Library</div>
            <div style={{ fontSize: 13, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workflow.libraryTitle}</div>
            <span className="tag tag-outline" style={{ fontSize: 10, marginTop: 4 }}>{TYPE_LABEL[workflow.libraryType]}</span>
          </div>
          <div style={{ marginTop: '8px', padding: '8px 0px', borderTop: '1px solid var(--color-divider)' }}>
            <div className="card-kicker">Activities</div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>Click to drop one in the middle of the canvas.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paletteTypes.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.5, padding: '8px 2px' }}>Activity types for {TYPE_LABEL[workflow.libraryType]} libraries aren’t defined yet.</div>
            ) : (
              paletteTypes.map((type) => {
                const meta = ACTIVITY_TYPE_META[type];
                return (
                  <div key={type} className="blueprint" onClick={() => addActivity(type)} style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                    <span style={{ width: 24, height: 24, flex: 'none', background: 'var(--color-accent-900)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 11 }}>
                      {meta.code}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, lineHeight: 1.15 }}>{meta.label}</span>
                      <span className="text-muted" style={{ display: 'block', fontSize: 10 }}>{meta.hint}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ flex: 'none', marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, gap: 6, fontSize: 13 }} onClick={onEdit}>
            <EditIcon width={14} height={14} />
            Edit info
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, gap: 6, fontSize: 13, color: '#8a2f2f' }} onClick={onDelete}>
            <TrashIcon width={14} height={14} />
            Delete
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        onPointerDown={startPan}
        onWheel={onWheel}
        style={{ flex: '1 1 auto', minWidth: 420, position: 'relative', overflow: 'hidden', cursor: dragRef.current?.mode === 'pan' ? 'grabbing' : 'default', background: 'color-mix(in srgb, var(--color-text) 2.5%, var(--color-bg))' }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            backgroundImage: 'linear-gradient(color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            backgroundPosition: '-4000px -4000px',
            width: 1,
            height: 1,
            overflow: 'visible',
          }}
        >
          <svg width={9000} height={6000} style={{ position: 'absolute', left: -4000, top: -4000, overflow: 'visible', pointerEvents: 'none' }}>
            <g transform="translate(4000,4000)">
              {edges.map((edge) => {
                const from = activities.find((a) => a.id === edge.fromId);
                const to = activities.find((a) => a.id === edge.toId);
                if (!from || !to) return null;
                const fromPos = positionOf(from);
                const toPos = positionOf(to);
                const isSelected = selectedEdge?.fromId === edge.fromId && selectedEdge?.toId === edge.toId;
                const d = edgePath(fromPos.x + NODE_W, fromPos.y + PORT_Y, toPos.x, toPos.y + PORT_Y);
                return (
                  <g key={`${edge.fromId}-${edge.toId}`}>
                    <path d={d} fill="none" stroke={isSelected ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 35%, transparent)'} strokeWidth={isSelected ? 2 : 1.5} />
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(undefined);
                        setSelectedEdge(edge);
                      }}
                    />
                  </g>
                );
              })}
              {dragRef.current?.mode === 'link' && linkTo && (() => {
                const from = activities.find((a) => a.id === (dragRef.current as { fromId: string }).fromId);
                if (!from) return null;
                const fromPos = positionOf(from);
                return <path d={edgePath(fromPos.x + NODE_W, fromPos.y + PORT_Y, linkTo.x, linkTo.y)} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 4" />;
              })()}
            </g>
          </svg>

          {activities.map((activity) => {
            const pos = positionOf(activity);
            const isSelected = selectedId === activity.id;
            const meta = ACTIVITY_TYPE_META[activity.type];
            return (
              <div
                key={activity.id}
                data-activity-id={activity.id}
                onPointerDown={(e) => startNodeDrag(activity, e)}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  background: 'var(--color-bg)',
                  border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                  cursor: 'grab',
                  userSelect: 'none',
                  opacity: activity.enabled ? 1 : 0.5,
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderBottom: '1px solid var(--color-divider)' }}>
                  <span style={{ width: 26, height: 26, flex: 'none', background: 'var(--color-accent-900)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 11 }}>
                    {meta.code}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.name}</span>
                    <span className="text-muted" style={{ display: 'block', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{meta.label}</span>
                  </span>
                  {!activity.enabled && <span className="tag tag-outline" style={{ fontSize: 9, flex: 'none' }}>Disabled</span>}
                </div>
                <div className="text-muted" style={{ padding: '7px 10px 0', fontSize: 11, lineHeight: 1.3 }}>{activity.description || 'No description yet.'}</div>
                <div style={{ padding: '2px 10px 8px', fontSize: 10, letterSpacing: '0.03em', color: 'var(--color-accent-700)' }}>{summaryFor(activity)}</div>
                <span style={{ position: 'absolute', left: -6, top: PORT_Y, width: 11, height: 11, background: 'var(--color-bg)', border: '1px solid var(--color-accent)' }} />
                <span
                  onPointerDown={(e) => startLink(activity, e)}
                  style={{ position: 'absolute', right: -6, top: PORT_Y, width: 11, height: 11, background: 'var(--color-bg)', border: '1px solid var(--color-accent)', cursor: 'crosshair' }}
                />
              </div>
            );
          })}
        </div>

        <div style={{ position: 'absolute', left: 16, top: 16, pointerEvents: 'none' }}>
          <div className="blueprint" style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'auto' }}>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => zoomBy(1 / 1.2)} style={{ width: 32, height: 32 }}><MinusIcon width={15} height={15} /></button>
            <span style={{ width: 48, textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => zoomBy(1.2)} style={{ width: 32, height: 32 }}><PlusIcon width={15} height={15} /></button>
            <span style={{ width: 1, height: 20, background: 'var(--color-divider)' }} />
            <button type="button" className="btn btn-ghost" onClick={fit} style={{ width: 84, height: 32, justifyContent: 'center', fontSize: 12, gap: 6 }}><MaximizeIcon width={14} height={14} />Fit</button>
            <button type="button" className="btn btn-ghost" onClick={tidyUp} style={{ width: 96, height: 32, justifyContent: 'center', fontSize: 12, gap: 6 }}><LayoutGridIcon width={14} height={14} />Tidy up</button>
          </div>
        </div>

        {!loading && activities.length === 0 && (
          <div className="text-muted" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 13, textAlign: 'center', pointerEvents: 'none' }}>
            No activities yet — pick one from the palette to start building this workflow.
          </div>
        )}

        <div className="text-muted" style={{ position: 'absolute', left: 16, right: 16, bottom: 16, fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
          Drag a node to move · drag the right port to connect · click a link to remove it · Del removes the selection
        </div>
      </div>

      {selected && (
        <WorkflowActivityInspector
          workflowId={workflow.id}
          activity={selected}
          activities={activities}
          contents={contents}
          maxChapters={discoveredCount}
          onUpdate={patch}
          onRemove={(id) => {
            remove(id);
            setSelectedId(undefined);
          }}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </div>
  );
}
