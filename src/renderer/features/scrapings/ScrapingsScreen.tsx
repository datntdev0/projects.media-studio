import { useState } from 'react';
import { CloseIcon, PauseIcon, PlayIcon, TrashIcon } from '../../components/icons';
import { AppLibraryType } from '../../../shared/app-library';
import { ScrapingJobState, ScrapingJobStatus, type ScrapingJob } from '../../../shared/app-scraping';
import { TYPE_LABEL } from '../library/libraryFormat';
import { useScrapingJobs } from './useScrapingJobs';

const TAB_OPTIONS: { state: ScrapingJobState; label: string }[] = [
  { state: ScrapingJobState.Active, label: 'Active' },
  { state: ScrapingJobState.Scheduled, label: 'Scheduled' },
  { state: ScrapingJobState.History, label: 'History' },
];

const STATUS_LABEL: Record<ScrapingJobStatus, string> = {
  [ScrapingJobStatus.Scheduled]: 'Scheduled',
  [ScrapingJobStatus.Queued]: 'Queued',
  [ScrapingJobStatus.Running]: 'Running',
  [ScrapingJobStatus.Paused]: 'Paused',
  [ScrapingJobStatus.Stopped]: 'Stopped',
  [ScrapingJobStatus.Completed]: 'Completed',
  [ScrapingJobStatus.Failed]: 'Failed',
};

const STATUS_TAG_CLASS: Record<ScrapingJobStatus, string> = {
  [ScrapingJobStatus.Scheduled]: 'tag-neutral',
  [ScrapingJobStatus.Queued]: 'tag-neutral',
  [ScrapingJobStatus.Running]: 'tag-accent',
  [ScrapingJobStatus.Paused]: 'tag-outline',
  [ScrapingJobStatus.Stopped]: 'tag-outline',
  [ScrapingJobStatus.Completed]: 'tag-accent',
  [ScrapingJobStatus.Failed]: 'tag-outline',
};

const SETTLED = new Set([ScrapingJobStatus.Stopped, ScrapingJobStatus.Completed, ScrapingJobStatus.Failed]);

const EMPTY_COPY: Record<ScrapingJobState, { title: string; hint: string }> = {
  [ScrapingJobState.Active]: { title: 'Nothing running', hint: 'Start a scraping job from an item, and it appears here while it runs.' },
  [ScrapingJobState.Scheduled]: { title: 'Nothing booked', hint: 'A job given a start time waits here until the clock reaches it.' },
  [ScrapingJobState.History]: { title: 'Nothing finished yet', hint: 'A job that has completed, failed or been stopped is kept here.' },
};

function primaryActionFor(status: ScrapingJobStatus): { label: string; next: ScrapingJobStatus; Icon: typeof PlayIcon } | null {
  switch (status) {
    case ScrapingJobStatus.Scheduled:
      return { label: 'Start now', next: ScrapingJobStatus.Queued, Icon: PlayIcon };
    case ScrapingJobStatus.Paused:
      return { label: 'Resume', next: ScrapingJobStatus.Queued, Icon: PlayIcon };
    case ScrapingJobStatus.Queued:
    case ScrapingJobStatus.Running:
      return { label: 'Pause', next: ScrapingJobStatus.Paused, Icon: PauseIcon };
    default:
      return null;
  }
}

function progressPct(job: ScrapingJob): number {
  if (job.total === 0) return 0;
  return Math.round(((job.completed + job.failed) / job.total) * 100);
}

function metaFor(job: ScrapingJob): string {
  const parts = [job.crawler, `${job.total} chapters`];
  if (job.skipped) parts.push(`${job.skipped} skipped`);
  if (job.failed) parts.push(`${job.failed} failed`);
  return parts.join(' · ');
}

function formatTime(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : '—';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ScrapingsScreen() {
  const [tab, setTab] = useState<ScrapingJobState>(ScrapingJobState.Active);
  const [libraryType, setLibraryType] = useState<AppLibraryType | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const { jobs, loading, error, refresh, removeJob, setJobStatus } = useScrapingJobs(tab, libraryType);
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  const changeTab = (next: ScrapingJobState) => {
    setTab(next);
    setSelectedId(undefined);
  };

  const handleSetStatus = async (id: string, status: ScrapingJobStatus) => {
    setPendingId(id);
    setActionError(undefined);
    try {
      await setJobStatus(id, status);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(undefined);
    }
  };

  const handleRemove = async (id: string) => {
    setPendingId(id);
    setActionError(undefined);
    try {
      await removeJob(id);
      if (selectedId === id) setSelectedId(undefined);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(undefined);
    }
  };

  const empty = EMPTY_COPY[tab];
  const activeCount = jobs.filter((job) => job.status === ScrapingJobStatus.Running).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, flexWrap: 'wrap' }}>
        <div className="seg">
          {TAB_OPTIONS.map((option) => (
            <label className="seg-opt" key={option.state}>
              <input type="radio" name="jtab" checked={tab === option.state} onChange={() => changeTab(option.state)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <select className="input" style={{ width: 160 }} value={libraryType ?? ''} onChange={(e) => setLibraryType((e.target.value || undefined) as AppLibraryType | undefined)}>
          <option value="">All libraries</option>
          {Object.values(AppLibraryType).map((type) => (
            <option key={type} value={type}>{TYPE_LABEL[type]}</option>
          ))}
        </select>
        {tab === ScrapingJobState.Active && <span className="tag tag-neutral">{activeCount} running</span>}
        <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => refresh()}>Refresh</button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a2f2f', fontSize: 13 }}>
          Could not load the jobs.
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => refresh()}>Try again</button>
        </div>
      )}
      {actionError && <div style={{ color: '#8a2f2f', fontSize: 12 }}>{actionError}</div>}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 13.6, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10.2 }}>
          {!loading && jobs.length === 0 && (
            <div className="blueprint" style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', borderStyle: 'dashed', padding: 34 }}>
              <div>
                <h3 style={{ margin: '6px 0 6px' }}>{empty.title}</h3>
                <div className="text-muted" style={{ maxWidth: 340, margin: '0 auto' }}>{empty.hint}</div>
              </div>
            </div>
          )}

          {jobs.map((job) => {
            const primary = primaryActionFor(job.status);
            const settled = SETTLED.has(job.status);
            const busy = pendingId === job.id;

            return (
              <div
                key={job.id}
                className="blueprint"
                style={{ padding: '13.6px 20.4px', cursor: 'pointer', background: selected?.id === job.id ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent' }}
                onClick={() => setSelectedId(job.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10.2 }}>
                  <span className="tag tag-accent">{TYPE_LABEL[job.libraryType]}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.libraryTitle}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{metaFor(job)}</div>
                  </div>
                  <span className={`tag ${STATUS_TAG_CLASS[job.status]}`}>{STATUS_LABEL[job.status]}</span>
                  <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    {settled ? (
                      <button type="button" className="btn btn-secondary btn-icon" title="Delete" disabled={busy} style={{ width: 28, height: 28, borderColor: 'transparent' }} onClick={() => handleRemove(job.id)}>
                        <TrashIcon width={14} height={14} />
                      </button>
                    ) : (
                      <>
                        {primary && (
                          <button type="button" className="btn btn-secondary btn-icon" title={primary.label} disabled={busy} style={{ width: 28, height: 28, borderColor: 'transparent' }} onClick={() => handleSetStatus(job.id, primary.next)}>
                            <primary.Icon width={14} height={14} />
                          </button>
                        )}
                        <button type="button" className="btn btn-secondary btn-icon" title="Cancel" disabled={busy} style={{ width: 28, height: 28, borderColor: 'transparent' }} onClick={() => handleSetStatus(job.id, ScrapingJobStatus.Stopped)}>
                          <CloseIcon width={14} height={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13.6, marginTop: 10.2 }}>
                  <div style={{ flex: 1, height: 4, background: 'color-mix(in srgb, var(--color-text) 12%, transparent)' }}>
                    <div style={{ height: 4, background: 'var(--color-accent)', width: `${progressPct(job)}%` }} />
                  </div>
                  <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 130, textAlign: 'right' }}>{job.completed} / {job.total} chapters</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ width: 340, flex: 'none', borderLeft: '1px solid var(--color-divider)', overflow: 'auto' }}>
          {selected ? (
            <div style={{ padding: 20.4 }}>
              <div className="card-kicker">{TYPE_LABEL[selected.libraryType]} · {STATUS_LABEL[selected.status]}</div>
              <h4 style={{ margin: '2px 0 2px' }}>{selected.libraryTitle}</h4>
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 13.6 }}>{metaFor(selected)}</div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 32, lineHeight: 1 }}>{selected.completed}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>of {selected.total} · {progressPct(selected)}%</span>
              </div>
              <div style={{ marginTop: 8, height: 6, background: 'color-mix(in srgb, var(--color-text) 12%, transparent)' }}>
                <div style={{ height: 6, background: 'var(--color-accent)', width: `${progressPct(selected)}%` }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 13.6, marginTop: 20.4 }}>
                <div><div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Range</div><div style={{ fontSize: 14 }}>{selected.range}</div></div>
                <div><div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Mode</div><div style={{ fontSize: 14 }}>{selected.refetch ? 'Force re-scrape' : 'Skip existing'}</div></div>
                <div><div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Queued</div><div style={{ fontSize: 14 }}>{formatTime(selected.queuedAt)}</div></div>
                <div><div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{SETTLED.has(selected.status) ? 'Settled' : 'Starts'}</div><div style={{ fontSize: 14 }}>{formatTime(SETTLED.has(selected.status) ? selected.completedAt : selected.startAt)}</div></div>
              </div>

              {!SETTLED.has(selected.status) && (
                <div style={{ display: 'flex', gap: 6.8, marginTop: 20.4 }}>
                  {primaryActionFor(selected.status) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1, fontSize: 13, gap: 6 }}
                      disabled={pendingId === selected.id}
                      onClick={() => handleSetStatus(selected.id, primaryActionFor(selected.status)!.next)}
                    >
                      {primaryActionFor(selected.status)!.label}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: 13, color: '#8a2f2f' }}
                    disabled={pendingId === selected.id}
                    onClick={() => handleSetStatus(selected.id, ScrapingJobStatus.Stopped)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {SETTLED.has(selected.status) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 20.4, gap: 6, color: '#8a2f2f' }}
                  disabled={pendingId === selected.id}
                  onClick={() => handleRemove(selected.id)}
                >
                  <TrashIcon width={14} height={14} />
                  Delete job
                </button>
              )}

              {selected.failed > 0 && (
                <div style={{ marginTop: 20.4, paddingTop: 20.4, borderTop: '1px solid var(--color-divider)' }}>
                  <h5 style={{ margin: '0 0 4px' }}>Failed ({selected.failed})</h5>
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>The item's content list names which chapters, and why each failed.</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20.4 }}>
              <div className="text-muted">Select a job to see what it was asked to do.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
