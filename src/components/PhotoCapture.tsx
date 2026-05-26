import { useRef, useState, useCallback } from 'react';

interface Props {
  onCapture: (blob: Blob) => void;
}

export function PhotoCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
      });
      setStream(s);
      setUseCamera(true);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setCameraError(true);
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    // 512×768 portrait crop
    const size = Math.min(video.videoWidth, video.videoHeight * (512 / 768));
    const srcH = size * (768 / 512);
    const srcX = (video.videoWidth - size) / 2;
    const srcY = (video.videoHeight - srcH) / 2;
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, srcX, srcY, size, srcH, 0, 0, 512, 768);
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setUseCamera(false);
    canvas.toBlob(blob => { if (blob) onCapture(blob); }, 'image/jpeg', 0.85);
  }, [stream, onCapture]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 768;
        const ctx = canvas.getContext('2d')!;
        const ar = img.width / img.height;
        const targetAr = 512 / 768;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ar > targetAr) {
          sw = img.height * targetAr;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAr;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 512, 768);
        canvas.toBlob(blob => { if (blob) onCapture(blob); }, 'image/jpeg', 0.85);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  const btnStyle: React.CSSProperties = {
    background: 'var(--color-accent)',
    color: '#000',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: '15px',
    border: 'none',
    padding: '14px 28px',
    width: '100%',
    letterSpacing: '0.02em',
  };

  if (useCamera && stream) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxHeight: '60vh', objectFit: 'cover', background: '#000' }}
        />
        <button onClick={captureFromCamera} style={btnStyle}>
          SNAP PHOTO
        </button>
        <button onClick={() => { stream.getTracks().forEach(t => t.stop()); setStream(null); setUseCamera(false); }}
          style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
        Photo of yourself (full body, plain background works best)
      </p>
      {!cameraError && (
        <button onClick={startCamera} style={btnStyle}>
          USE CAMERA
        </button>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        style={{ ...btnStyle, background: cameraError ? 'var(--color-accent)' : 'var(--color-surface)', color: cameraError ? '#000' : 'var(--color-text-primary)' }}
      >
        {cameraError ? 'CHOOSE PHOTO' : 'UPLOAD PHOTO'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}
