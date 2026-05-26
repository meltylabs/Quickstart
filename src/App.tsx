import { useState } from 'react';
import type { GenerationResult, AppStep } from './types';
import { IntroScreen } from './components/IntroScreen';
import { PhotoCapture } from './components/PhotoCapture';
import { GarmentUpload } from './components/GarmentUpload';
import { LoadingState } from './components/LoadingState';
import { TryOnResult } from './components/TryOnResult';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function ProgressDots({ active }: { active: number }) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '0 0 24px' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: i <= active ? 'var(--color-accent)' : 'var(--color-border)',
            transition: 'background 300ms',
          }}
        />
      ))}
    </div>
  );
}

function App() {
  const [step, setStep] = useState<AppStep>(() => {
    try {
      if (sessionStorage.getItem('fitdrop:result')) return 'result';
      if (sessionStorage.getItem('fitdrop:intro-seen')) return 'person';
    } catch { /* private browsing */ }
    return 'intro';
  });

  const [personBlob, setPersonBlob] = useState<Blob | null>(null);
  const [itemNameForLoading, setItemNameForLoading] = useState('');
  const [result, setResult] = useState<GenerationResult | null>(() => {
    try {
      const saved = sessionStorage.getItem('fitdrop:result');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);

  const handleIntroDismiss = () => {
    try { sessionStorage.setItem('fitdrop:intro-seen', '1'); } catch { /* ignore */ }
    setStep('person');
  };

  const handlePersonCapture = (blob: Blob) => {
    setPersonBlob(blob);
    setStep('garment');
  };

  const handleGarmentReady = async (garmentBlob: Blob, itemName: string) => {
    setItemNameForLoading(itemName);
    setError(null);
    setStep('generating');

    try {
      const [personBase64, garmentBase64] = await Promise.all([
        blobToBase64(personBlob!),
        blobToBase64(garmentBlob),
      ]);

      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personBase64, garmentBase64, itemName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
      }

      const genResult: GenerationResult = await res.json();
      setResult(genResult);
      try { sessionStorage.setItem('fitdrop:result', JSON.stringify(genResult)); } catch { /* ignore */ }
      setStep('result');
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Try again.');
      setStep('garment');
    }
  };

  const handleReset = () => {
    try { sessionStorage.removeItem('fitdrop:result'); } catch { /* ignore */ }
    setPersonBlob(null);
    setResult(null);
    setError(null);
    setStep('person');
  };

  const showDots = step === 'person' || step === 'garment';
  const dotActive = step === 'garment' ? 1 : 0;

  return (
    <>
      {step === 'intro' && <IntroScreen onDismiss={handleIntroDismiss} />}

      {step === 'generating' && <LoadingState itemName={itemNameForLoading} />}

      {step !== 'intro' && step !== 'generating' && (
        <div style={{
          maxWidth: '480px',
          margin: '0 auto',
          padding: '20px 20px 40px',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ marginBottom: showDots ? '20px' : '28px' }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '28px',
              color: 'var(--color-accent)',
              letterSpacing: '0.06em',
            }}>
              FITDROP
            </span>
          </div>

          {showDots && <ProgressDots active={dotActive} />}

          {error && (
            <div style={{
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid var(--color-drop)',
              padding: '12px 14px',
              marginBottom: '16px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: 'var(--color-drop)',
            }}>
              {error}
            </div>
          )}

          <div style={{ flex: 1 }}>
            {step === 'person' && (
              <PhotoCapture onCapture={handlePersonCapture} />
            )}
            {step === 'garment' && (
              <GarmentUpload onReady={handleGarmentReady} />
            )}
            {step === 'result' && result && (
              <TryOnResult result={result} onReset={handleReset} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
