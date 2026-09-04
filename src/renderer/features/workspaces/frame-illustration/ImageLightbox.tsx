import { useEffect, type CSSProperties } from 'react';
import { ArrowLeftIcon, CloseIcon } from '@/components/icons';

/** One image of the slideshow — the drawn images of what the pane is showing, in the order it lists them. */
export interface LightboxSlide {
  file: string;
  url: string;
  title: string;
  note: string;
}

interface ImageLightboxProps {
  slides: LightboxSlide[];
  /** The file being shown, or undefined when the slideshow is closed. */
  file: string | undefined;
  onFile(next: string | undefined): void;
}

const NAV_BUTTON: CSSProperties = { flex: 'none', display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%', border: '1px solid color-mix(in srgb, #fff 30%, transparent)', background: 'color-mix(in srgb, #000 45%, transparent)', color: '#fff', cursor: 'pointer' };

/**
 * The large view of a drawn image, as a slideshow over the images beside it:
 * arrow keys and the side buttons step through them, Escape or the backdrop closes.
 */
export function ImageLightbox({ slides, file, onFile }: ImageLightboxProps) {
  const index = slides.findIndex((slide) => slide.file === file);

  useEffect(() => {
    if (index < 0) return undefined;
    const step = (by: number) => onFile(slides[(index + by + slides.length) % slides.length]?.file);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFile(undefined);
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides, index, onFile]);

  if (index < 0) return null;
  const slide = slides[index];
  const step = (by: number) => onFile(slides[(index + by + slides.length) % slides.length].file);
  const many = slides.length > 1;

  return (
    <div className="dialog-backdrop" style={{ background: 'color-mix(in srgb, #000 82%, transparent)', padding: 20.4 }} onClick={() => onFile(undefined)}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 10.2 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, color: '#fff' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{slide.title}</div>
            <div style={{ fontSize: 12, opacity: .7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slide.note}</div>
          </div>
          <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6 }}>
            <span style={{ fontSize: 12, opacity: .7, fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {slides.length}</span>
            <button type="button" title="Close · Esc" style={{ ...NAV_BUTTON, width: 34, height: 34 }} onClick={() => onFile(undefined)}>
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 13.6 }}>
          {many && (
            <button type="button" title="Previous · ←" style={NAV_BUTTON} onClick={() => step(-1)}>
              <ArrowLeftIcon width={20} height={20} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'grid', placeItems: 'center' }}>
            <img src={slide.url} alt={slide.file} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
          {many && (
            <button type="button" title="Next · →" style={{ ...NAV_BUTTON, transform: 'rotate(180deg)' }} onClick={() => step(1)}>
              <ArrowLeftIcon width={20} height={20} />
            </button>
          )}
        </div>

        <div style={{ flex: 'none', textAlign: 'center', color: '#fff', fontSize: 12, opacity: .6 }}>{slide.file}</div>
      </div>
    </div>
  );
}
