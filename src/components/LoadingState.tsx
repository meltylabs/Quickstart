import { useEffect, useState } from 'react';

interface Props {
  itemName: string;
}

const MILESTONES = [
  { at: 0, pct: 0 },
  { at: 3000, pct: 20 },
  { at: 8000, pct: 50 },
  { at: 15000, pct: 80 },
];

export function LoadingState({ itemName }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = MILESTONES.map(({ at, pct }) =>
      setTimeout(() => setProgress(pct), at)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '24px',
    }}>
      <h2 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(48px, 10vw, 72px)',
        color: 'var(--color-text-primary)',
        letterSpacing: '0.03em',
        animation: 'fitdrop-pulse 1.6s ease-in-out infinite',
      }}>
        DROPPING IN...
      </h2>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontWeight: 400,
        fontSize: '16px',
        color: 'var(--color-text-secondary)',
        textAlign: 'center',
      }}>
        Dropping in your {itemName}...
      </p>
      {progress > 0 && (
        <div style={{
          width: '200px',
          height: '2px',
          background: 'var(--color-border)',
          borderRadius: '1px',
          marginTop: '8px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--color-accent)',
            transition: 'width 1s var(--ease-out-standard)',
          }} />
        </div>
      )}
      <style>{`
        @keyframes fitdrop-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes fitdrop-pulse { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
