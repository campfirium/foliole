import { vi } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

function fail(name: keyof EditorAdapter): never {
  throw new Error(`Unexpected EditorAdapter.${String(name)} call in test fixture`);
}

export function createMockEditorAdapter(overrides: Partial<EditorAdapter> = {}): EditorAdapter {
  return {
    destroy: vi.fn(() => fail('destroy')),
    focus: vi.fn(() => fail('focus')),
    getContent: vi.fn(() => fail('getContent')),
    getDocumentPositionAtViewportY: vi.fn(() => fail('getDocumentPositionAtViewportY')),
    getLineBlockHeight: vi.fn(() => fail('getLineBlockHeight')),
    getPrimaryVisiblePosition: vi.fn(() => fail('getPrimaryVisiblePosition')),
    getPositionViewportTop: vi.fn(() => fail('getPositionViewportTop')),
    getScrollMetrics: vi.fn(() => fail('getScrollMetrics')),
    getScrollTop: vi.fn(() => fail('getScrollTop')),
    getSelection: vi.fn(() => fail('getSelection')),
    getSelectionRanges: vi.fn(() => fail('getSelectionRanges')),
    getViewportRect: vi.fn(() => fail('getViewportRect')),
    isPositionNearViewportRatio: vi.fn(() => fail('isPositionNearViewportRatio')),
    onContentChange: vi.fn(() => fail('onContentChange')),
    onScroll: vi.fn(() => fail('onScroll')),
    replaceRange: vi.fn(() => fail('replaceRange')),
    replaceSelection: vi.fn(() => fail('replaceSelection')),
    restoreSelection: vi.fn(() => fail('restoreSelection')),
    revealPosition: vi.fn(() => fail('revealPosition')),
    revealSelection: vi.fn(() => fail('revealSelection')),
    revealSelectionAtViewportRatio: vi.fn(() => fail('revealSelectionAtViewportRatio')),
    revealSelectionCentered: vi.fn(() => fail('revealSelectionCentered')),
    revealSelectionNearest: vi.fn(() => fail('revealSelectionNearest')),
    setContent: vi.fn(() => fail('setContent')),
    setDiffDecorations: vi.fn(() => fail('setDiffDecorations')),
    setParagraphMarker: vi.fn(() => fail('setParagraphMarker')),
    setReadOnly: vi.fn(() => fail('setReadOnly')),
    setScrollTop: vi.fn(() => fail('setScrollTop')),
    setSearchDecorations: vi.fn(() => fail('setSearchDecorations')),
    setSelection: vi.fn(() => fail('setSelection')),
    setSelectionRanges: vi.fn(() => fail('setSelectionRanges')),
    setTextAnchorDecorations: vi.fn(() => fail('setTextAnchorDecorations')),
    ...overrides
  };
}
