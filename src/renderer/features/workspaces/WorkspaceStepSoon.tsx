import { AVAILABILITY_LABEL, STEP_NAME, orderLabelOf, stepSoonNoteOf, type WorkspaceStepView } from './workspaceFormat';

interface WorkspaceStepSoonProps {
  view: WorkspaceStepView;
}

/** Stand-in pane for a step whose own screen is not built yet. */
export function WorkspaceStepSoon({ view }: WorkspaceStepSoonProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: 20.4 }}>
      <div className="blueprint" style={{ borderStyle: 'dashed', padding: '44px 54px', textAlign: 'center', maxWidth: 520 }}>
        <div className="card-kicker">Step {orderLabelOf(view.idx)} · {AVAILABILITY_LABEL[view.availability]}</div>
        <h3 style={{ margin: '6px 0 8px' }}>{STEP_NAME[view.key]}</h3>
        <p className="text-muted" style={{ margin: '0 0 17px', fontSize: 13.5, lineHeight: 1.5, textWrap: 'pretty' }}>{stepSoonNoteOf(view)}</p>
        <button type="button" className="btn btn-secondary" disabled>Notify me when available</button>
      </div>
    </div>
  );
}
