import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { usePdfSelectionContextMenu } from './PdfSelectionContextMenu';

it('keeps a PDF text selection visible while its annotation toolbar is open', () => {
  const locator = { id: 'selection', page: 1, x: 0.25, y: 0.5 };
  const { result } = renderHook(() => usePdfSelectionContextMenu({
    nodeId: 'pdf-node',
    onCreateHighlightFromSelection: vi.fn()
  }));

  act(() => {
    result.current.openSelectionToolbar({
      capturedAt: Date.now(),
      locator,
      selectionText: 'Selected PDF text'
    }, { left: 100, top: 80 });
  });

  expect(result.current.selectionMenuState).toMatchObject({ selectionText: 'Selected PDF text' });
  expect(result.current.selectionOverlayLocator).toEqual(locator);

  act(() => result.current.closeSelectionMenu());
  expect(result.current.selectionOverlayLocator).toBeUndefined();
});
