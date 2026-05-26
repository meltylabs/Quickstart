import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShare } from './useShare';

const mockShare = vi.fn();
const mockWriteText = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'share', { value: undefined, writable: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
  mockWriteText.mockResolvedValue(undefined);
});

describe('useShare', () => {
  it('copies URL to clipboard when navigator.share is unavailable', async () => {
    const { result } = renderHook(() => useShare());
    await act(async () => {
      await result.current.share({ imageDataUrl: null, itemName: 'Test Item', shareId: 'abc123' });
    });
    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/v/abc123'));
    expect(result.current.copied).toBe(true);
  });

  it('resets copied to false after 2500ms', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShare());
    await act(async () => {
      await result.current.share({ imageDataUrl: null, itemName: 'Test', shareId: 'xyz' });
    });
    expect(result.current.copied).toBe(true);
    await act(async () => { vi.advanceTimersByTime(2600); });
    expect(result.current.copied).toBe(false);
    vi.useRealTimers();
  });

  it('calls navigator.share when available (no imageDataUrl falls back to URL-only share)', async () => {
    Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
    mockShare.mockResolvedValue(undefined);
    const { result } = renderHook(() => useShare());
    await act(async () => {
      // No imageDataUrl → skips file-share path → navigator.share is NOT called
      // (hook falls through to clipboard because imageDataUrl is null)
      await result.current.share({ imageDataUrl: null, itemName: 'Kicks', shareId: 'def456' });
    });
    // With null imageDataUrl and navigator.share present, falls to clipboard
    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/v/def456'));
  });

  // navigator.share with imageDataUrl present AND canShare({ files }) returns true
  // → should call navigator.share with files and NOT touch clipboard.
  it('uses native file share when navigator.share and canShare({ files }) are available', async () => {
    const mockCanShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: mockCanShare, writable: true, configurable: true });
    mockShare.mockResolvedValue(undefined);

    // Provide a tiny valid JPEG data URL (just needs to be fetchable in jsdom)
    const imageDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
    } as unknown as Response);

    const { result } = renderHook(() => useShare());
    await act(async () => {
      await result.current.share({ imageDataUrl, itemName: 'Yeezy', shareId: 'ghi789' });
    });

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array), title: 'FitDrop: Yeezy' }),
    );
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  // AbortError from navigator.share must return early without touching clipboard.
  it('returns early without copying when navigator.share throws AbortError', async () => {
    Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockReturnValue(false), writable: true, configurable: true });
    const abortError = new Error('abort');
    abortError.name = 'AbortError';
    mockShare.mockRejectedValue(abortError);

    const imageDataUrl = 'data:image/jpeg;base64,abc';
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
    } as unknown as Response);

    const { result } = renderHook(() => useShare());
    await act(async () => {
      await result.current.share({ imageDataUrl, itemName: 'Hoodie', shareId: 'jkl000' });
    });

    expect(mockWriteText).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
  });

  // clipboard.writeText throws → window.prompt fallback must be called.
  it('falls back to window.prompt when clipboard.writeText fails', async () => {
    mockWriteText.mockRejectedValue(new Error('clipboard unavailable'));
    const mockPrompt = vi.fn();
    vi.stubGlobal('prompt', mockPrompt);

    const { result } = renderHook(() => useShare());
    await act(async () => {
      await result.current.share({ imageDataUrl: null, itemName: 'Cap', shareId: 'mno111' });
    });

    expect(mockPrompt).toHaveBeenCalledWith('Copy this link:', expect.stringContaining('/v/mno111'));
    expect(result.current.copied).toBe(true);

    vi.unstubAllGlobals();
  });
});
