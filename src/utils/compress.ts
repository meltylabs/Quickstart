const MAX_BYTES = 200 * 1024;

export async function compressImageToJpeg(
  src: string,
  maxBytes = MAX_BYTES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // Already small enough — return as-is
      const fullQuality = canvas.toDataURL('image/jpeg', 1.0);
      const fullBytes = Math.ceil((fullQuality.length - 22) * 0.75);
      if (fullBytes <= maxBytes) {
        resolve(fullQuality);
        return;
      }

      // Binary search for quality that fits
      let lo = 0.1;
      let hi = 1.0;
      let result = fullQuality;

      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const candidate = canvas.toDataURL('image/jpeg', mid);
        const bytes = Math.ceil((candidate.length - 22) * 0.75);
        if (bytes <= maxBytes) {
          result = candidate;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      resolve(result);
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = src;
  });
}
