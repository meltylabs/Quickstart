import { useRef, useState, useCallback } from 'react';

interface Props {
  onReady: (blob: Blob, itemName: string) => void;
}

export function GarmentUpload({ onReady }: Props) {
  const [garmentBlob, setGarmentBlob] = useState<Blob | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          if (!blob) return;
          setGarmentBlob(blob);
          setGarmentPreview(ev.target?.result as string);
        }, 'image/jpeg', 0.9);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) processFile(file);
  }, [processFile]);

  const handleSubmit = () => {
    if (garmentBlob && itemName.trim()) {
      onReady(garmentBlob, itemName.trim());
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 400,
    fontSize: '15px',
    padding: '12px 14px',
    width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
          background: dragging ? 'rgba(245,158,11,0.05)' : 'var(--color-surface)',
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 150ms, background 150ms',
          position: 'relative',
          minHeight: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {garmentPreview ? (
          <img
            src={garmentPreview}
            style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain' }}
            alt="Garment preview"
          />
        ) : (
          <div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}>
              Drop garment photo or tap to upload
            </p>
            <p style={{ color: 'var(--color-accent)', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginTop: '4px' }}>
              Flat lay or product shot works best
            </p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      <div>
        <label style={{ display: 'block', fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Item Name
        </label>
        <input
          type="text"
          value={itemName}
          onChange={e => setItemName(e.target.value.slice(0, 60))}
          placeholder="e.g. Nike x Off-White Dunk Low"
          maxLength={60}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = 'var(--color-accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
        />
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px', textAlign: 'right' }}>
          {itemName.length}/60
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!garmentBlob || !itemName.trim()}
        style={{
          background: garmentBlob && itemName.trim() ? 'var(--color-accent)' : 'var(--color-surface)',
          color: garmentBlob && itemName.trim() ? '#000' : 'var(--color-text-secondary)',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: '15px',
          border: 'none',
          padding: '14px 28px',
          width: '100%',
          letterSpacing: '0.02em',
          cursor: garmentBlob && itemName.trim() ? 'pointer' : 'not-allowed',
          transition: 'background 150ms, color 150ms',
        }}
      >
        GENERATE FIT
      </button>
    </div>
  );
}
