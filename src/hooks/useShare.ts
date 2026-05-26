import { useState, useCallback } from 'react';

interface ShareOptions {
  imageDataUrl: string | null;
  itemName: string;
  shareId: string;
}

export function useShare() {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async ({ imageDataUrl, itemName, shareId }: ShareOptions) => {
    const url = `${window.location.origin}/v/${shareId}`;
    const title = `FitDrop: ${itemName}`;
    const text = `Cop or drop? ${itemName} — vote here`;

    if (navigator.share && imageDataUrl) {
      try {
        // Convert data URL to File for native share sheet
        const res = await fetch(imageDataUrl);
        const blob = await res.blob();
        const file = new File([blob], `fitdrop-${shareId}.jpg`, { type: 'image/jpeg' });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title, text, url });
          return;
        }
        // Fall through to URL-only share if file share not supported
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Desktop fallback: copy URL + show toast
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Last resort: prompt
      window.prompt('Copy this link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  return { share, copied };
}
