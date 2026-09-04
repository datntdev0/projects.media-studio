import type { ReactNode } from 'react';
import { SparkleIcon } from '@/components/icons';
import type { DesignImageState } from '../illustrationFormat';

interface PromptCardProps {
  image: DesignImageState;
  /** The thumbnail's shape — a character sheet is portrait, a frame is 16:9. */
  width: number;
  height: number;
  /** The description above the prompt: what the metadata says about this drawable. */
  children: ReactNode;
  label: string;
  prompt: string;
  onPrompt(next: string): void;
  onGenerate(): void;
  disabled: boolean;
  /** Whether this card is the one being drawn right now — an image takes minutes. */
  working: boolean;
  /** What the card says beside its button. */
  note: string;
  /** Opens the drawn image large, or undefined when the card has no slideshow to open. */
  onOpen?(): void;
}

/** The thumbnail of one drawable: the image once it exists, the file name it will take until then. */
function Thumbnail({ image, width, height, onOpen }: { image: DesignImageState; width: number; height: number; onOpen: (() => void) | undefined }) {
  const opens = image.url !== undefined && onOpen !== undefined;
  return (
    <div
      className={image.url ? '' : 'wireframe'}
      onClick={opens ? onOpen : undefined}
      title={opens ? 'Click to view large' : undefined}
      style={{ width, height, flex: 'none', border: '1px solid var(--color-divider)', background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden', cursor: opens ? 'zoom-in' : undefined }}
    >
      <span className={`tag ${image.tagClass}`} style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, padding: '1px 6px', zIndex: 1 }}>{image.tag}</span>
      {image.url ? (
        <img src={image.url} alt={image.file} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span className="text-muted" style={{ fontSize: 11, background: 'var(--color-bg)', padding: '2px 6px' }}>{image.file}</span>
      )}
    </div>
  );
}

/**
 * One drawable of the step — a character's base look, one of its outfits, or a
 * frame of a chapter: what it was built from, the prompt it is drawn with, and
 * the button that draws it.
 */
export function PromptCard({ image, width, height, children, label, prompt, onPrompt, onGenerate, disabled, working, note, onOpen }: PromptCardProps) {
  return (
    <div className="blueprint" style={{ display: 'flex', gap: 17, padding: 13.6, marginBottom: 13.6 }}>
      <Thumbnail image={image} width={width} height={height} onOpen={onOpen} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10.2 }}>
        {children}
        <div className="field" style={{ flex: 1 }}>
          <label>{label}</label>
          <textarea className="input" value={prompt} onChange={(e) => onPrompt(e.target.value)} style={{ minHeight: 72, fontSize: 12.5, lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 12.5, gap: 6 }}
            disabled={disabled}
            onClick={onGenerate}
          >
            <SparkleIcon width={14} height={14} />
            {working ? 'Drawing…' : image.cta}
          </button>
          <span className="text-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{note}</span>
        </div>
      </div>
    </div>
  );
}
