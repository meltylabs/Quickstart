import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImageToJpeg } from './compress';

// jsdom doesn't load images; stub Image to fire onload immediately
class FakeImage {
  crossOrigin = '';
  naturalWidth = 100;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

// compressImageToJpeg uses toDataURL (not toBlob), so just stub that
beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);

  // Return a short data URL so fullBytes <= maxBytes path is taken
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,/9j/shortdata',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('compressImageToJpeg', () => {
  it('returns a data URL string', async () => {
    const result = await compressImageToJpeg('data:image/jpeg;base64,abc123');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^data:image\/jpeg/);
  });

  it('resolves without throwing on valid input', async () => {
    await expect(compressImageToJpeg('data:image/jpeg;base64,abc123')).resolves.toBeDefined();
  });

  // Binary search path: toDataURL returns a "large" data URL (>maxBytes), so the
  // function must enter the binary search loop and ultimately resolve with the
  // best-fitting candidate.
  it('enters binary search and resolves when image exceeds maxBytes', async () => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    // Build a base64 payload large enough to exceed the 200 KB limit.
    // base64 byte estimate: Math.ceil((length - 22) * 0.75) > 200*1024
    // → length > 200*1024/0.75 + 22 ≈ 273_430 chars
    const bigPayload = 'A'.repeat(280_000);
    const bigDataUrl = `data:image/jpeg;base64,${bigPayload}`;

    // First call (quality 1.0) returns big; subsequent calls return something small.
    const toDataURLSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    toDataURLSpy.mockReturnValueOnce(bigDataUrl)               // fullQuality check
                .mockReturnValue('data:image/jpeg;base64,/9j/small'); // binary search iterations

    const result = await compressImageToJpeg('data:image/jpeg;base64,abc123');
    expect(result).toMatch(/^data:image\/jpeg/);
    // toDataURL must have been called more than once (initial + at least one search step)
    expect(toDataURLSpy.mock.calls.length).toBeGreaterThan(1);
  });

  // onerror path: the promise must reject when the image fails to load.
  it('rejects when the image fails to load', async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    class ErrorImage {
      crossOrigin = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal('Image', ErrorImage);

    await expect(
      compressImageToJpeg('data:image/jpeg;base64,broken'),
    ).rejects.toThrow('Failed to load image for compression');
  });
});
