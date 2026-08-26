import { useState } from 'react';
import { AppLibraryContentStatus } from '../../../shared/app-library-content';
import type { ChapterRow } from './chapter';

type ScrapeScope = 'missing' | 'all' | 'range';

interface ScrapeDialogProps {
  chapters: ChapterRow[];
  onClose(): void;
}

function tint(on: boolean): string {
  return on ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent';
}

/** Mirrors the mockup's scrape dialog — scoping and options only, since queuing a real job arrives with the job runner. */
export function ScrapeDialog({ chapters, onClose }: ScrapeDialogProps) {
  const chapterNumbers = chapters.map((c) => c.no);
  const minNo = chapterNumbers.length ? Math.min(...chapterNumbers) : 1;
  const maxNo = chapterNumbers.length ? Math.max(...chapterNumbers) : 1;

  const [scope, setScope] = useState<ScrapeScope>('missing');
  const [force, setForce] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(minNo);
  const [rangeTo, setRangeTo] = useState(maxNo);

  const missingCount = chapters.filter((c) => c.status !== AppLibraryContentStatus.Completed).length;
  const rangeCount = chapters.filter((c) => c.no >= Math.min(rangeFrom, rangeTo) && c.no <= Math.max(rangeFrom, rangeTo)).length;
  const queueCount = scope === 'missing' ? missingCount : scope === 'all' ? chapters.length : rangeCount;

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(600px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">Start a scraping job</div>
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 20.4, maxHeight: '60vh', overflow: 'auto' }}>
          <div className="field">
            <label>What to extract</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="blueprint" style={{ padding: '10.2px 13.6px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', background: tint(scope === 'missing') }}>
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                <input type="radio" name="scope" style={{ position: 'absolute', opacity: 0 }} checked={scope === 'missing'} onChange={() => setScope('missing')} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>Everything not yet extracted</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{missingCount} chapters</div>
                </div>
                <span className="tag tag-accent">Recommended</span>
              </label>
              <label className="blueprint" style={{ padding: '10.2px 13.6px', cursor: 'pointer', display: 'block', background: tint(scope === 'all') }}>
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                <input type="radio" name="scope" style={{ position: 'absolute', opacity: 0 }} checked={scope === 'all'} onChange={() => setScope('all')} />
                <div style={{ fontSize: 14 }}>Everything — including already extracted</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{chapters.length} chapters</div>
              </label>
              <label className="blueprint" style={{ padding: '10.2px 13.6px', cursor: 'pointer', display: 'block', background: tint(scope === 'range') }}>
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                <input type="radio" name="scope" style={{ position: 'absolute', opacity: 0 }} checked={scope === 'range'} onChange={() => setScope('range')} />
                <div style={{ fontSize: 14 }}>A specific range</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    type="number"
                    value={rangeFrom}
                    style={{ width: 88 }}
                    onFocus={() => setScope('range')}
                    onChange={(e) => setRangeFrom(Number(e.target.value) || 0)}
                  />
                  <span className="text-muted" style={{ fontSize: 13 }}>to</span>
                  <input
                    className="input"
                    type="number"
                    value={rangeTo}
                    style={{ width: 88 }}
                    onFocus={() => setScope('range')}
                    onChange={(e) => setRangeTo(Number(e.target.value) || 0)}
                  />
                  <span className="text-muted" style={{ fontSize: 12 }}>{rangeCount} chapters</span>
                </div>
              </label>
            </div>
          </div>

          {scope === 'range' && (
            <div className="field">
              <label>If content already exists</label>
              <div style={{ display: 'flex', border: '1px solid var(--color-divider)', width: 'fit-content' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForce(false)}
                  style={{ border: 'none', borderRight: '1px solid var(--color-divider)', fontSize: 13, padding: '0 12px', height: 32, background: !force ? 'var(--color-accent)' : 'transparent', color: !force ? 'var(--color-bg)' : 'var(--color-text)' }}
                >
                  Skip it
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForce(true)}
                  style={{ border: 'none', fontSize: 13, padding: '0 12px', height: 32, background: force ? 'var(--color-accent)' : 'transparent', color: force ? 'var(--color-bg)' : 'var(--color-text)' }}
                >
                  Force re-scrape from source
                </button>
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Force overwrites stored content — manual edits to chapters in scope are lost.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 13.6 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>On failure</label>
              <select className="input" defaultValue="retry3">
                <option value="retry3">Retry 3× then mark failed</option>
                <option value="retry1">Retry once</option>
                <option value="none">Do not retry</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Start</label>
              <select className="input" defaultValue="now">
                <option value="now">Queue it now</option>
                <option value="scheduled">At a set time</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8, paddingTop: 13.6, borderTop: '1px solid var(--color-divider)', marginTop: 13.6 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>{queueCount} chapters to queue</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>Start job</button>
          </div>
        </div>
      </div>
    </div>
  );
}
