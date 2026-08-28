import { useState, type ReactNode } from 'react';
import type { PipelineOutputPage } from '../../../shared/app-workflow-activity';

const PAGE_SIZE = 50;

interface LazySectionProps<T> {
  title: string;
  count: number;
  emptyLabel: string;
  fetchPage(offset: number, limit: number): Promise<PipelineOutputPage<T>>;
  renderItem(item: T, index: number): ReactNode;
  keyOf(item: T, index: number): string;
}

/** A collapsible Output-tab section that only fetches its (paginated) data once expanded — keeps a large novel's pipeline output (world bible, translated chapters, ...) from being loaded or rendered all at once. */
export function LazySection<T>({ title, count, emptyLabel, fetchPage, renderItem, keyOf }: LazySectionProps<T>) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMore = () => {
    setLoading(true);
    fetchPage(items.length, PAGE_SIZE).then((page) => {
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setLoading(false);
    });
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items.length === 0 && count > 0) loadMore();
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: 10 }}>▶</span>
        <span className="card-kicker">{title}</span>
        <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{count}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {count === 0 ? (
            <div className="text-muted" style={{ fontSize: 12 }}>{emptyLabel}</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, i) => (
                  <div key={keyOf(item, i)}>{renderItem(item, i)}</div>
                ))}
              </div>
              {(total === null || items.length < total) && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11 }} onClick={loadMore} disabled={loading}>
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
