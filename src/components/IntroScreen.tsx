import { useEffect, useState } from 'react';

interface Props {
  onDismiss: () => void;
}

export function IntroScreen({ onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 400);
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        cursor: 'pointer',
        zIndex: 100,
        opacity: exiting ? 0 : 1,
        transition: 'opacity 400ms ease-in',
        userSelect: 'none',
      }}
    >
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(72px, 14vw, 120px)',
        color: 'var(--color-text-primary)',
        letterSpacing: '0.03em',
        lineHeight: 1,
        textAlign: 'center',
      }}>
        Drop Alert.
      </h1>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontWeight: 400,
        fontSize: '18px',
        color: 'var(--color-text-secondary)',
        textAlign: 'center',
        maxWidth: '320px',
      }}>
        Try on your next fit before it ships.
      </p>
    </div>
  );
}
