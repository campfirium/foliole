import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alignSelectionInViewport,
  isPositionNearViewportRatio,
  resolveDocumentPositionAtViewportY,
  subscribeToEditorScroll
} from './codeMirrorEditorAdapterView';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
});

function createMeasuredView(view: {
  scrollDOM: { scrollTop: number; [key: string]: unknown };
  [key: string]: unknown;
}) {
  type MeasuredView = typeof view & {
    requestMeasure: (spec: {
      read: (measuredView: MeasuredView) => unknown;
      write: (measure: unknown, measuredView: MeasuredView) => void;
    }) => void;
  };
  const measuredView = {
    ...view,
    requestMeasure: (spec: {
      read: (measuredView: MeasuredView) => unknown;
      write: (measure: unknown, measuredView: MeasuredView) => void;
    }) => {
      window.setTimeout(() => {
        const typedView = measuredView as MeasuredView;
        const measure = spec.read(typedView);
        spec.write(measure, typedView);
      }, 0);
    }
  } as MeasuredView;
  return measuredView;
}

function registerFallbackAlignmentGeometryTests() {
  it('aligns with line block positions when character coords are unavailable', () => {
    const scrollDOM = {
      clientHeight: 400,
      getBoundingClientRect: () => ({ top: 100 }),
      scrollHeight: 4000,
      scrollTop: 0
    };
    const view = createMeasuredView({
      coordsAtPos: vi.fn(() => null),
      lineBlockAt: vi.fn(() => ({ top: 1000 })),
      scrollDOM
    }) as never;

    alignSelectionInViewport(view, 3157, 0.15);
    vi.runAllTimers();

    expect(scrollDOM.scrollTop).toBe(940);
  });

  it('defers ratio alignment until the next frame and retries against updated coordinates', () => {
    const scrollDOM = {
      clientHeight: 400,
      getBoundingClientRect: () => ({ height: 400, top: 100 }),
      scrollHeight: 4000,
      scrollTop: 0
    };
    const view = createMeasuredView({
      coordsAtPos: vi.fn(() => ({ top: scrollDOM.scrollTop === 0 ? 1200 : 200 })),
      scrollDOM
    }) as never;

    alignSelectionInViewport(view, 3157, 0.15);

    expect(scrollDOM.scrollTop).toBe(0);

    vi.runOnlyPendingTimers();
    expect(scrollDOM.scrollTop).toBe(1040);

    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();

    expect(scrollDOM.scrollTop).toBe(1080);
  });

  it('cancels stale alignment retries when a newer target takes ownership', () => {
    const scrollDOM = {
      clientHeight: 400,
      getBoundingClientRect: () => ({ height: 400, top: 100 }),
      scrollHeight: 4000,
      scrollTop: 0
    };
    const coordsAtPos = vi.fn((position: number) => ({ top: position - scrollDOM.scrollTop + 100 }));
    const view = createMeasuredView({ coordsAtPos, scrollDOM }) as never;

    alignSelectionInViewport(view, 1000, 0.5);
    alignSelectionInViewport(view, 1500, 0.5);
    vi.runAllTimers();

    expect(coordsAtPos.mock.calls.filter(([position]) => position === 1000)).toHaveLength(1);
    expect(scrollDOM.scrollTop).toBe(1300);
  });
}

function registerFallbackAlignmentResolutionTests() {
  it('checks anchor proximity with line block positions when character coords are unavailable', () => {
    const view = createMeasuredView({
      coordsAtPos: vi.fn(() => null),
      lineBlockAt: vi.fn(() => ({ top: 760 })),
      scrollDOM: {
        getBoundingClientRect: () => ({ height: 400, top: 100 }),
        scrollTop: 700
      }
    }) as never;

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
}

describe('codeMirrorEditorAdapterView fallback alignment', () => {
  registerFallbackAlignmentGeometryTests();
  registerFallbackAlignmentResolutionTests();
});

describe('codeMirrorEditorAdapterView scroll subscription', () => {
  it('coalesces repeated scroll events into one callback per frame', () => {
    const listener = vi.fn();
    const { dom, scrollDOM, scrollListeners } = createScrollDomHarness();
    const unsubscribe = subscribeToEditorScroll({ dom, scrollDOM } as never, listener);
    const handleScroll = scrollListeners.get('scroll');

    expect(handleScroll).toBeTypeOf('function');
    handleScroll?.(new Event('scroll'));
    handleScroll?.(new Event('scroll'));
    handleScroll?.(new Event('scroll'));

    expect(listener).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(listener).toHaveBeenCalledExactlyOnceWith({ userInitiated: false });

    unsubscribe();
  });

  it('marks wheel-driven scroll callbacks as user initiated', () => {
    const listener = vi.fn();
    const { dom, scrollDOM, scrollListeners } = createScrollDomHarness();
    const unsubscribe = subscribeToEditorScroll({ dom, scrollDOM } as never, listener);

    scrollListeners.get('wheel')?.(new Event('wheel'));
    scrollListeners.get('scroll')?.(new Event('scroll'));
    vi.runAllTimers();

    expect(listener).toHaveBeenCalledExactlyOnceWith({ userInitiated: true });

    unsubscribe();
  });

  it('marks keyboard-driven scroll callbacks as user initiated', () => {
    const listener = vi.fn();
    const { dom, domListeners, scrollDOM, scrollListeners } = createScrollDomHarness();
    const unsubscribe = subscribeToEditorScroll({ dom, scrollDOM } as never, listener);

    domListeners.get('keydown')?.(new KeyboardEvent('keydown', { key: 'PageDown' }));
    scrollListeners.get('scroll')?.(new Event('scroll'));
    vi.runAllTimers();

    expect(listener).toHaveBeenCalledExactlyOnceWith({ userInitiated: true });

    unsubscribe();
  });

  it('does not treat a consumed keyboard shortcut as user scroll intent', () => {
    const listener = vi.fn();
    const { dom, domListeners, scrollDOM, scrollListeners } = createScrollDomHarness();
    const unsubscribe = subscribeToEditorScroll({ dom, scrollDOM } as never, listener);
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' });
    event.preventDefault();

    domListeners.get('keydown')?.(event);
    scrollListeners.get('scroll')?.(new Event('scroll'));
    vi.runAllTimers();

    expect(listener).toHaveBeenCalledExactlyOnceWith({ userInitiated: false });

    unsubscribe();
  });
});

function createScrollDomHarness() {
  const domListeners = new Map<string, EventListener>();
  const scrollListeners = new Map<string, EventListener>();
  return {
    dom: {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        domListeners.set(event, handler);
      }),
      removeEventListener: vi.fn((event: string) => {
        domListeners.delete(event);
      })
    },
    domListeners,
    scrollDOM: {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        scrollListeners.set(event, handler);
      }),
      removeEventListener: vi.fn((event: string) => {
        scrollListeners.delete(event);
      })
    },
    scrollListeners
  };
}
