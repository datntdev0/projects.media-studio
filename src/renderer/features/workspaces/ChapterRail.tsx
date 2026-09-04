import type { ChapterRailTag } from './translationFormat';

export interface ChapterRailRow {
  idx: number;
  title: string;
  tag: ChapterRailTag;
  /** An extra line under the title, where the step has more to say about the chapter. */
  sub?: string;
}

interface ChapterRailProps {
  rows: ChapterRailRow[];
  selected: number | undefined;
  onPick(idx: number): void;
  /** What a greyed row means, said once under the list. */
  note: string;
  width?: number;
}

/** The chapters down the side of a step's pane, each with how far the step has got with it. */
export function ChapterRail({ rows, selected, onPick, note, width = 360 }: ChapterRailProps) {
  return (
    <div style={{ width, flex: 'none', borderRight: '1px solid var(--color-divider)', overflow: 'auto' }}>
      {rows.map((row) => (
        <div
          key={row.idx}
          title={row.tag.tip}
          onClick={() => row.tag.open && onPick(row.idx)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13.6px', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)', cursor: row.tag.open ? 'pointer' : 'not-allowed', opacity: row.tag.open ? 1 : 0.45, background: row.idx === selected ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : undefined }}
        >
          <span className="text-muted" style={{ fontSize: 12, width: 28, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{row.idx}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
            {row.sub && <span className="text-muted" style={{ display: 'block', fontSize: 11 }}>{row.sub}</span>}
          </span>
          <span className={`tag ${row.tag.tagClass}`} style={{ flex: 'none', fontSize: 10, padding: '1px 6px' }}>{row.tag.label}</span>
        </div>
      ))}
      <div className="text-muted" style={{ padding: '10px 13.6px', fontSize: 11, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}
