import { useRef, useState } from 'react';

interface ExportVideoImagePickerProps {
  workflowId: string;
  value: string | null;
  onChange(imageFile: string | null): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Picks, previews, and clears an Export Video activity's static source image, backed by `appWorkflowActivityApi.uploadExportVideoImage`. */
export function ExportVideoImagePicker({ workflowId, value, onChange }: ExportVideoImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(undefined);
    try {
      onChange(await window.appWorkflowActivityApi.uploadExportVideoImage(workflowId, file.name, file.type, await file.arrayBuffer()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="field" style={{ marginBottom: 13.6 }}>
      <label>Image</label>
      <div className={`blueprint${value ? '' : ' wireframe'}`} style={{ width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
        {value && <img src={value} alt="Export video source" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
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
      <div style={{ display: 'flex', gap: 6.8, marginTop: 6.8, width: '100%' }}>
        <button className="btn btn-secondary" type="button" style={{ flex: 1, fontSize: 12 }} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : value ? 'Change' : 'Upload'}
        </button>
        {value && (
          <button className="btn btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => onChange(null)} disabled={uploading}>
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
