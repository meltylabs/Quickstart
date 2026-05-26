import { QRCodeCanvas } from 'qrcode.react';

interface Props {
  imageDataUrl: string;
  itemName: string;
  shareId: string;
}

export function FitDropCard({ imageDataUrl, itemName, shareId }: Props) {
  const voteUrl = `${window.location.origin}/v/${shareId}`;

  return (
    <div style={{
      width: '1080px',
      height: '1920px',
      background: '#0a0a0a',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Photo — top 80% */}
      <img
        src={imageDataUrl}
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1080px',
          height: '1536px',
          objectFit: 'cover',
          objectPosition: 'center top',
        }}
        alt=""
      />
      {/* Gradient seam */}
      <div style={{
        position: 'absolute',
        bottom: '384px',
        left: 0,
        right: 0,
        height: '220px',
        background: 'linear-gradient(to bottom, transparent, #0a0a0a)',
        pointerEvents: 'none',
      }} />
      {/* Footer — bottom 384px */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '384px',
        background: '#0a0a0a',
        padding: '32px 56px 56px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Item name */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '80px',
          color: '#f5f5f5',
          letterSpacing: '0.03em',
          lineHeight: 1,
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          wordBreak: 'break-word',
          overflow: 'hidden',
        }}>
          {itemName}
        </div>
        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '28px',
            color: '#f59e0b',
            letterSpacing: '0.06em',
          }}>
            FITDROP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: '14px',
              color: '#a3a3a3',
              letterSpacing: '0.06em',
            }}>
              SCAN TO COP OR DROP
            </span>
            <div style={{ background: '#0a0a0a', padding: '8px', lineHeight: 0 }}>
              <QRCodeCanvas
                value={voteUrl}
                size={96}
                bgColor="#0a0a0a"
                fgColor="#f5f5f5"
                level="M"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
