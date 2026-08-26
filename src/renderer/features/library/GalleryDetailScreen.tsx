import { RefreshIcon, UploadIcon } from '../../components/icons';
import { AppLibraryType, LibrarySourceMode, type AppLibrary } from '../../../shared/app-library';
import { STATUS_TAG_CLASS, contentLabelOf, contentUnitOf, formatBytes, formatDate } from './libraryFormat';
import { DetailHeader } from './DetailHeader';

interface GalleryDetailScreenProps {
  item: AppLibrary;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
}

export function GalleryDetailScreen({ item, onBack, onEdit, onDelete }: GalleryDetailScreenProps) {
  const isCrawler = item.sourceMode === LibrarySourceMode.Crawler;
  const metadata = item.imageMetadata ?? item.videoMetadata;
  const size = metadata ? formatBytes(metadata.downloadedSize) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20.4, height: '100%', overflow: 'hidden' }}>
      <DetailHeader backLabel="Library" onBack={onBack} title={item.title} />

      <div style={{ flex: 'none', paddingBottom: 20.4, borderBottom: '1px solid var(--color-divider)', display: 'flex', gap: 27.2, alignItems: 'flex-start' }}>
        <div className={`blueprint${item.coverUrl ? '' : ' wireframe'}`} style={{ width: 96, flex: 'none', aspectRatio: '3/4', position: 'relative', overflow: 'hidden' }}>
          {item.coverUrl &&<img src={item.coverUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px' }}>{item.title}</h3>
          <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{item.status}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 27.2, marginTop: 13.6, fontSize: 13 }}>
            <div>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Assets</div>
              {contentLabelOf(item)}
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Mode</div>
              {isCrawler ? 'Crawler' : 'Manual upload'}
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Crawler</div>
              {isCrawler ? item.sourceName : '—'}
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Size</div>
              {size}
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Updated</div>
              {formatDate(item.updatedAt)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6.8 }}>
          <button type="button" className="btn btn-secondary" onClick={onEdit} style={{ fontSize: 13 }}>Edit metadata</button>
          <button type="button" className="btn btn-ghost" onClick={onDelete} style={{ fontSize: 13, color: '#8a2f2f' }}>Delete item</button>
          <button type="button" className="btn btn-secondary" disabled title="Scraping arrives with the job runner." style={{ gap: 6, fontSize: 13 }}>
            <RefreshIcon width={15} height={15} />
            Discover new links
          </button>
          <button type="button" className="btn btn-primary" onClick={() => {}} style={{ gap: 6 }}>
            <UploadIcon width={15} height={15} />
            Upload
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 27.2 }}>
          <div className="blueprint" style={{ display: 'grid', placeItems: 'center', aspectRatio: '1', borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center', padding: 13.6 }}>
            <div>
              <UploadIcon width={22} height={22} style={{ margin: '0 auto 6px', opacity: 0.6 }} />
              <div style={{ fontSize: 13 }}>Drop files or browse</div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {item.type === AppLibraryType.Video ? 'MP4, MOV, WebM · max 2 GB' : 'JPG, PNG, WebP · max 200 MB'}
              </div>
            </div>
          </div>
        </div>
        {(metadata?.discoveredCount ?? 0) === 0 && (
          <div className="text-muted" style={{ marginTop: 13.6, fontSize: 12 }}>No {contentUnitOf(item)} recorded yet — upload some to get started.</div>
        )}
      </div>
    </div>
  );
}
