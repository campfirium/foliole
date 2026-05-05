import { vi } from 'vitest';

export const mockMarkNodePositionRequested = vi.fn();
export const mockMarkNodePositionReady = vi.fn();
export const mockDestroy = vi.fn();
export const mockSetContent = vi.fn();
export const mockSetDiffDecorations = vi.fn();
export const mockSetSearchDecorations = vi.fn();
export const mockSetHideTitleHeading = vi.fn();
export const mockSetSelection = vi.fn();
export const mockRevealSelection = vi.fn();
export const mockRevealSelectionAtViewportRatio = vi.fn();
export const mockIsPositionNearViewportRatio = vi.fn<(position: number, ratio: number) => boolean>(() => true);
export const mockRestoreSelection = vi.fn();
export const mockSetScrollTop = vi.fn();
export const mockOnScroll = vi.fn(() => () => undefined);

let currentScrollTop = 0;

export function resetLongDocumentEditorMocks() {
  mockMarkNodePositionRequested.mockClear();
  mockMarkNodePositionReady.mockClear();
  mockDestroy.mockClear();
  mockSetContent.mockClear();
  mockSetDiffDecorations.mockClear();
  mockSetSearchDecorations.mockClear();
  mockSetHideTitleHeading.mockClear();
  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();
  mockRevealSelectionAtViewportRatio.mockClear();
  mockIsPositionNearViewportRatio.mockClear();
  mockIsPositionNearViewportRatio.mockReturnValue(true);
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
  mockOnScroll.mockClear();
  currentScrollTop = 0;
}

export function createMockCodeMirrorEditorAdapterClass() {
  return class {
    constructor(...args: unknown[]) { void args; }
    destroy() { mockDestroy(); }
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) { mockSetContent(content); }
    setDiffDecorations(diffDecorations: unknown) { mockSetDiffDecorations(diffDecorations); }
    setSearchDecorations(searchDecorations: unknown) { mockSetSearchDecorations(searchDecorations); }
    setTextAnchorDecorations() {}
    setHideTitleHeading(value: boolean) { mockSetHideTitleHeading(value); }
    getSelection() { return { from: 0, to: 0 }; }
    isPositionNearViewportRatio(position: number, ratio: number) {
      return mockIsPositionNearViewportRatio(position, ratio);
    }
    setParagraphMarker() {}
    setSelection(selection: { from: number; to: number }) { mockSetSelection(selection); }
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection(selection: { from: number; to: number }) { mockRevealSelection(selection); }
    revealSelectionAtViewportRatio(selection: { from: number; to: number }, ratio: number) {
      mockRevealSelectionAtViewportRatio(selection, ratio);
    }
    getScrollTop() { return currentScrollTop; }
    setScrollTop(scrollTop: number) {
      currentScrollTop = scrollTop;
      mockSetScrollTop(scrollTop);
    }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    replaceRange() {}
    replaceSelection() {}
    onContentChange() { return () => undefined; }
    onScroll() { return mockOnScroll(); }
  };
}
