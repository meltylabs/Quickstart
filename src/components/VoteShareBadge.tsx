import { useShare } from '../hooks/useShare';

interface Props {
  imageDataUrl: string;
  itemName: string;
  shareId: string;
  vote: 'cop' | 'drop';
  cop: number;
  drop: number;
}

export function VoteShareBadge({ imageDataUrl, itemName, shareId, vote, cop, drop }: Props) {
  const { share, copied } = useShare();
  const total = cop + drop;
  const copPct = total > 0 ? Math.round((cop / total) * 100) : 50;
  const dropPct = total > 0 ? Math.round((drop / total) * 100) : 50;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
      padding: '24px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      animation: 'vsbadge-in 300ms var(--ease-out-standard) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          border: `2px solid ${vote === 'cop' ? 'var(--color-cop)' : 'var(--color-drop)'}`,
        }}>
          <img src={imageDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} alt="" />
        </div>
        <div>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            color: vote === 'cop' ? 'var(--color-cop)' : 'var(--color-drop)',
            margin: 0,
            letterSpacing: '0.05em',
          }}>
            {vote === 'cop' ? 'YOU COPPED' : 'YOU DROPPED'}
          </p>
          <p style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '22px',
            color: 'var(--color-text-primary)',
            margin: '2px 0 0',
            letterSpacing: '0.03em',
            lineHeight: 1,
          }}>
            {itemName}
          </p>
        </div>
      </div>

      {/* Vote bar */}
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-cop)', fontWeight: 600 }}>
            COP {copPct}%
          </span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-drop)', fontWeight: 600 }}>
            {dropPct}% DROP
          </span>
        </div>
        <div style={{ height: '4px', background: 'var(--color-border)', display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: `${copPct}%`, background: 'var(--color-cop)', transition: 'width 600ms var(--ease-out-standard)' }} />
          <div style={{ flex: 1, background: 'var(--color-drop)' }} />
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center', margin: '8px 0 0' }}>
          {total} vote{total !== 1 ? 's' : ''} total
        </p>
      </div>

      <button
        onClick={() => share({ imageDataUrl, itemName, shareId })}
        style={{
          background: 'var(--color-accent)',
          color: '#000',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: '14px',
          border: 'none',
          padding: '12px 24px',
          width: '100%',
          letterSpacing: '0.05em',
          cursor: 'pointer',
        }}
      >
        {copied ? 'LINK COPIED!' : 'SHARE FIT'}
      </button>

      <style>{`
        @keyframes vsbadge-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
