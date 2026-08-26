import { useRef, useState } from 'react';

interface CoverPickerProps {
  value: string;
  onChange(url: string): void;
  alt: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Picks, previews, and clears a library item's cover image, backed by `appLibraryApi.uploadCover`. */
export function CoverPicker({ value, onChange, alt }: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(undefined);
    try {
      onChange(await window.appLibraryApi.uploadCover(file.name, file.type, await file.arrayBuffer()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="field">
      <label>Cover</label>
      <div className={`blueprint${value ? '' : ' wireframe'}`} style={{ width: 150, aspectRatio: '3/4', position: 'relative', overflow: 'hidden' }}>
        {value &&<img src={value} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <div style={{ display: 'flex', gap: 6.8, marginTop: 6.8, width: 150 }}>
        <button className="btn btn-secondary" type="button" style={{ flex: 1, fontSize: 12 }} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : value ? 'Change' : 'Upload'}
        </button>
        {value && (
          <button className="btn btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => onChange('')} disabled={uploading}>
            Remove
          </button>
        )}
      </div>
      {error && (
        <div className="text-muted" style={{ color: '#8a2f2f', fontSize: 11, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
