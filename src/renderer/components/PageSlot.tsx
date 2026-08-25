interface PageSlotProps {
  title: string;
  hint: string;
}

// Placeholder content for a screen that hasn't been built out yet — mirrors
// the "page slot" pattern from the design mockups.
export function PageSlot({ title, hint }: PageSlotProps) {
  return (
    <div className="blueprint page-slot">
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div>
        <div className="card-kicker">Page slot</div>
        <h3 style={{ margin: '4px 0 6px' }}>{title}</h3>
        <div className="text-muted page-slot-hint">{hint}</div>
      </div>
    </div>
  );
}
