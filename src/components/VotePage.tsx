import { useEffect, useState, useCallback, useRef } from 'react';
import type { VoteData } from '../types';
import { VoteShareBadge } from './VoteShareBadge';

interface Props {
  shareId: string;
}

type PageState = 'loading' | 'ready' | 'voting' | 'voted' | 'rate-limited' | 'error';

export function VotePage({ shareId }: Props) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<VoteData | null>(null);
  const [myVote, setMyVote] = useState<'cop' | 'drop' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/vote?id=${shareId}`);
      if (!res.ok) {
        setPageState('error');
        return;
      }
      const raw = await res.json();
      setData({
        imageDataUrl: raw.imageDataUrl as string,
        itemName: raw.itemName as string,
        cop: Number(raw.cop ?? 0),
        drop: Number(raw.drop ?? 0),
      });
      if (pageState === 'loading') setPageState('ready');
    } catch {
      setPageState('error');
    }
  }, [shareId, pageState]);

  useEffect(() => {
    fetchData();
  }, []);

  // Poll every 5s while not yet voted
  useEffect(() => {
    if (pageState === 'voted' || pageState === 'error') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pageState, fetchData]);

  const handleVote = useCallback(async (vote: 'cop' | 'drop') => {
    if (pageState !== 'ready') return;
    setPageState('voting');
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId, vote }),
      });
      if (res.status === 429) {
        setPageState('rate-limited');
        return;
      }
      if (!res.ok) {
        setPageState('ready');
        return;
      }
      const raw = await res.json();
      setData(prev => prev ? {
        ...prev,
        cop: Number(raw.cop ?? prev.cop),
        drop: Number(raw.drop ?? prev.drop),
      } : prev);
      setMyVote(vote);
      setPageState('voted');
    } catch {
      setPageState('ready');
    }
  }, [pageState, shareId]);

  const containerStyle: React.CSSProperties = {
    minHeight: '100dvh',
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 0 40px',
    maxWidth: '480px',
    margin: '0 auto',
  };

  if (pageState === 'loading') {
    return (
      <div style={{ ...containerStyle, justifyContent: 'center' }}>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
          LOADING...
        </p>
      </div>
    );
  }

  if (pageState === 'error' || !data) {
    return (
      <div style={{ ...containerStyle, justifyContent: 'center', padding: '24px' }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '16px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          This fit couldn't be found.
        </p>
      </div>
    );
  }

  const total = data.cop + data.drop;
  const copPct = total > 0 ? Math.round((data.cop / total) * 100) : 50;
  const dropPct = total > 0 ? Math.round((data.drop / total) * 100) : 50;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ width: '100%', padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '24px', color: 'var(--color-accent)', letterSpacing: '0.05em' }}>
          FITDROP
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          COP OR DROP?
        </span>
      </div>

      {/* Image */}
      <img
        src={data.imageDataUrl}
        style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: '60vh', marginTop: '16px' }}
        alt={data.itemName}
      />

      <div style={{ width: '100%', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        {/* Item name */}
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(32px, 7vw, 48px)',
          color: 'var(--color-text-primary)',
          letterSpacing: '0.03em',
          margin: 0,
          lineHeight: 1,
        }}>
          {data.itemName}
        </h1>

        {pageState === 'voted' && myVote ? (
          <VoteShareBadge
            imageDataUrl={data.imageDataUrl}
            itemName={data.itemName}
            shareId={shareId}
            vote={myVote}
            cop={data.cop}
            drop={data.drop}
          />
        ) : pageState === 'rate-limited' ? (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
            You already voted on this fit.
          </p>
        ) : (
          <>
            {/* Vote buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleVote('cop')}
                disabled={pageState === 'voting'}
                style={{
                  flex: 1,
                  height: '56px',
                  background: 'var(--color-cop)',
                  color: '#fff',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: '18px',
                  border: 'none',
                  letterSpacing: '0.05em',
                  cursor: pageState === 'voting' ? 'not-allowed' : 'pointer',
                  opacity: pageState === 'voting' ? 0.7 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                COP
              </button>
              <button
                onClick={() => handleVote('drop')}
                disabled={pageState === 'voting'}
                style={{
                  flex: 1,
                  height: '56px',
                  background: 'var(--color-drop)',
                  color: '#fff',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: '18px',
                  border: 'none',
                  letterSpacing: '0.05em',
                  cursor: pageState === 'voting' ? 'not-allowed' : 'pointer',
                  opacity: pageState === 'voting' ? 0.7 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                DROP
              </button>
            </div>

            {/* Live counts */}
            {total > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ height: '4px', background: 'var(--color-border)', display: 'flex', overflow: 'hidden' }}>
                  <div style={{ width: `${copPct}%`, background: 'var(--color-cop)', transition: 'width 600ms var(--ease-out-standard)' }} />
                  <div style={{ flex: 1, background: 'var(--color-drop)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-cop)', fontWeight: 600 }}>COP {copPct}%</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-text-secondary)' }}>{total} votes</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--color-drop)', fontWeight: 600 }}>{dropPct}% DROP</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
