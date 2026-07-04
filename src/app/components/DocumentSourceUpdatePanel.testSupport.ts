import { act } from '@testing-library/react';
import { vi } from 'vitest';

export interface PanelBodyCall {
  editorDiffDecorations?: unknown;
  onEditorReady?: (adapter: unknown) => void;
}

export function createScrollAdapter(options?: {
  getScrollTop?: () => number;
  onScroll?: (listener: () => void) => () => void;
  revealPosition?: ReturnType<typeof vi.fn>;
  scrollTop?: number;
  setScrollTop?: (scrollTop: number) => void;
}) {
  let scrollTop = options?.scrollTop ?? 0;

  return {
    getLineBlockHeight: () => 24,
    getScrollMetrics: () => ({ clientHeight: 300, scrollHeight: 1200, scrollTop: options?.getScrollTop?.() ?? scrollTop }),
    getScrollTop: () => options?.getScrollTop?.() ?? scrollTop,
    onScroll: options?.onScroll ?? (() => () => undefined),
    revealPosition: options?.revealPosition ?? vi.fn(),
    setScrollTop: vi.fn((nextScrollTop: number) => {
      scrollTop = nextScrollTop;
      options?.setScrollTop?.(nextScrollTop);
    })
  };
}

export function attachPanelAdapters(
  calls: unknown[][],
  currentAdapter: ReturnType<typeof createScrollAdapter>,
  updatedAdapter: ReturnType<typeof createScrollAdapter>
) {
  const currentReady = ((calls[0]?.[0] ?? {}) as PanelBodyCall).onEditorReady;
  const updatedReady = ((calls[1]?.[0] ?? {}) as PanelBodyCall).onEditorReady;

  act(() => {
    currentReady?.(currentAdapter as never);
    updatedReady?.(updatedAdapter as never);
  });
}
