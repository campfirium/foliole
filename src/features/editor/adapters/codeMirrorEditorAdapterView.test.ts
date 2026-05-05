import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alignSelectionInViewport,
  isPositionNearViewportRatio,
  resolveDocumentPositionAtViewportY
} from './codeMirrorEditorAdapterView';

describe('codeMirrorEditorAdapterView fallback alignment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  });

  it('aligns with line block positions when character coords are unavailable', () => {
    const scrollDOM = {
      clientHeight: 400,
      getBoundingClientRect: () => ({ top: 100 }),
      scrollHeight: 4000,
      scrollTop: 0
    };
    const view = {
      coordsAtPos: vi.fn(() => null),
      lineBlockAt: vi.fn(() => ({ top: 1000 })),
      scrollDOM
    } as never;

    alignSelectionInViewport(view, 3157, 0.15);
    vi.runAllTimers();

    expect(scrollDOM.scrollTop).toBe(940);
  });

  it('checks anchor proximity with line block positions when character coords are unavailable', () => {
    const view = {
      coordsAtPos: vi.fn(() => null),
      lineBlockAt: vi.fn(() => ({ top: 760 })),
      scrollDOM: {
        getBoundingClientRect: () => ({ height: 400, top: 100 }),
        scrollTop: 700
      }
    } as never;

    expect(isPositionNearViewportRatio(view, 3157, 0.15, 0.05)).toBe(true);
  });

  it('prefers viewport coordinates when resolving the visible document position', () => {
    const posAtCoords = vi.fn(() => 58005);
    const view = {
      contentDOM: {
        getBoundingClientRect: () => ({ left: 40, right: 640, width: 600 })
      },
      documentTop: 150,
      lineBlockAtHeight: vi.fn(() => ({ from: 3157 })),
      posAtCoords
    } as never;

    expect(resolveDocumentPositionAtViewportY(view, 260)).toBe(58005);
    expect(posAtCoords).toHaveBeenCalledWith({ x: 88, y: 260 }, false);
  });

  it('falls back to line block height when viewport coordinate lookup is unavailable', () => {
    const lineBlockAtHeight = vi.fn(() => ({ from: 3157 }));
    const view = {
      contentDOM: {
        getBoundingClientRect: () => ({ left: 40, right: 640, width: 600 })
      },
      documentTop: 150,
      lineBlockAtHeight,
      posAtCoords: vi.fn(() => null)
    } as never;

    expect(resolveDocumentPositionAtViewportY(view, 260)).toBe(3157);
    expect(lineBlockAtHeight).toHaveBeenCalledWith(110);
  });
});
