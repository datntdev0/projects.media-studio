import { ArrowLeftIcon } from './icons';

interface DetailHeaderProps {
  backLabel: string;
  onBack(): void;
  title: string;
}

/** Breadcrumb row shared by the library and workspace detail screens. */
export function DetailHeader({ backLabel, onBack, title }: DetailHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10.2 }}>
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ gap: 6, fontSize: 13, paddingLeft: 0, maxWidth: 260 }}>
        <ArrowLeftIcon width={15} height={15} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{backLabel}</span>
      </button>
      <span style={{ opacity: 0.35 }}>/</span>
      <h4 style={{ margin: 0, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h4>
    </div>
  );
}
