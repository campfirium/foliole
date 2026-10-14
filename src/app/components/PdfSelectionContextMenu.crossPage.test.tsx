import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { usePdfSelectionContextMenu } from './PdfSelectionContextMenu';

const selection = { locator: {
  pages: [1, 4].map(page => ({ page, x: 0.2, y: 0.3, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }] }))
}, selectionText: 'First page\nLast page' };

it('keeps the complete snapshot through failed writes and clears it only after confirmation', async () => {
  const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { result } = renderHook(() => usePdfSelectionContextMenu({ nodeId: 'pdf', onCreateHighlightFromSelection: write }));
  act(() => result.current.openSelectionToolbar(selection, { left: 10, top: 10 }));
  await act(async () => { await result.current.handleCreateHighlight(); });
  expect(write).toHaveBeenLastCalledWith(selection.selectionText, selection.locator);
  expect(result.current.selectionOverlayLocator).toEqual(selection.locator);
  await act(async () => { await result.current.handleCreateHighlight(); });
  expect(result.current.selectionOverlayLocator).toBeUndefined();
});

it('discards the completed snapshot when switching documents', () => {
  const { result, rerender } = renderHook(({ nodeId }) => usePdfSelectionContextMenu({ nodeId, onCreateHighlightFromSelection: vi.fn() }),
    { initialProps: { nodeId: 'first' } });
  act(() => result.current.openSelectionToolbar(selection, { left: 10, top: 10 }));
  rerender({ nodeId: 'second' });
  expect(result.current.selectionOverlayLocator).toBeUndefined();
  expect(result.current.selectionMenuState).toBeNull();
  expect(result.current.preservedSelectionRef.current).toBeNull();
});
