import { useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import type { GenerationResult } from '../types';
import { useShare } from '../hooks/useShare';
import { FitDropCard } from './FitDropCard';

interface Props {
  result: GenerationResult;
  onReset: () => void;
}

export function TryOnResult({ result, onReset }: Props) {
  const { share, copied } = useShare();
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const handleSaveCard = useCallback(async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#0a0a0a',
        width: 1080,
        height: 1920,
        scale: 1,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      await share({ imageDataUrl: dataUrl, itemName: result.itemName, shareId: result.shareId });
    } catch {
      // fallback: share the try-on image directly
      await share({ imageDataUrl: result.imageDataUrl, itemName: result.itemName, shareId: result.shareId });
    } finally {
      setSaving(false);
    }
  }, [result, share, saving]);

  const btnBase: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: '15px',
    border: 'none',
    padding: '14px 28px',
    width: '100%',
    letterSpacing: '0.02em',
    cursor: 'pointer',
    transition: 'opacity 150ms',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      animation: 'result-fade-up 300ms var(--ease-out-standard) both',
    }}>
      <img
        src={result.imageDataUrl}
        crossOrigin="anonymous"
        style={{ width: '100%', objectFit: 'contain', maxHeight: '65vh', display: 'block' }}
        alt={result.itemName}
      />

      <h2 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(28px, 6vw, 40px)',
        color: 'var(--color-text-primary)',
        letterSpacing: '0.03em',
        textAlign: 'center',
        margin: 0,
      }}>
        {result.itemName}
      </h2>

      <button
        onClick={handleSaveCard}
        disabled={saving}
        style={{ ...btnBase, background: 'var(--color-accent)', color: '#000', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'GENERATING...' : 'SAVE CARD'}
      </button>

      <button
        onClick={() => share({ imageDataUrl: result.imageDataUrl, itemName: result.itemName, shareId: result.shareId })}
        style={{ ...btnBase, background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
      >
        {copied ? 'LINK COPIED!' : 'SHARE FIT'}
      </button>

      <button
        onClick={onReset}
        style={{ ...btnBase, background: 'transparent', color: 'var(--color-text-secondary)', padding: '8px', fontSize: '13px' }}
      >
        TRY ANOTHER
      </button>

      {/* Off-screen card for html2canvas — behind all content, z-index -1 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '1080px',
        height: '1920px',
        zIndex: -1,
        pointerEvents: 'none',
      }}>
        <div ref={cardRef} style={{ width: '1080px', height: '1920px' }}>
          <FitDropCard
            imageDataUrl={result.imageDataUrl}
            itemName={result.itemName}
            shareId={result.shareId}
          />
        </div>
      </div>

      <style>{`
        @keyframes result-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
