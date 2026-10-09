import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderSelectionOverlay } from './PdfPageOverlays';
import { usePdfSelectionContextMenu } from './PdfSelectionContextMenu';

function SelectionSurface() {
  const menu = usePdfSelectionContextMenu({ nodeId: 'pdf-node', onCreateHighlightFromSelection: vi.fn() });
  const locator = menu.selectionOverlayLocator;
  return (
    <div data-pdf-page-number="1" data-testid="selection-surface" ref={(element) => { menu.surfaceRef.current = element; }}>
      <span>Both selected columns</span>
      {renderSelectionOverlay(locator ? { ...locator, id: 'selection', x: locator.x ?? 0.5, y: locator.y ?? 0.5 } : null, 12)}
    </div>
  );
}

it('updates visible selection coverage while dragging and clears it when selection collapses', () => {
  render(<SelectionSurface />);
  const surface = screen.getByTestId('selection-surface');
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  const text = surface.querySelector('span')?.firstChild;
  const selection = window.getSelection();
  if (!text || !selection) throw new Error('Selection unavailable');
  fireEvent.mouseDown(surface, { button: 0 });
  selection.setBaseAndExtent(text, 0, text, 4);
  const range = selection.getRangeAt(0);
  Object.defineProperty(range, 'getClientRects', { value: () => [new DOMRect(40, 60, 100, 14)] });
  fireEvent(document, new Event('selectionchange'));
  const firstCoverage = screen.getByTestId('pdf-selection-rect').getAttribute('d');
  selection.removeAllRanges();
  fireEvent(document, new Event('selectionchange'));
  expect(screen.queryByTestId('pdf-selection-rect')).toBeNull();

  selection.setBaseAndExtent(text, 0, text, text.textContent?.length ?? 0);
  Object.defineProperty(selection.getRangeAt(0), 'getClientRects', {
    value: () => [new DOMRect(40, 60, 100, 14), new DOMRect(330, 60, 160, 14)]
  });
  fireEvent(document, new Event('selectionchange'));
  expect(screen.getByTestId('pdf-selection-rect').getAttribute('d')).not.toBe(firstCoverage);
  expect(selection.toString()).toBe('Both selected columns');

  fireEvent.mouseUp(surface, { button: 0 });
  selection.removeAllRanges();
  fireEvent(document, new Event('selectionchange'));
  expect(screen.getByTestId('pdf-selection-rect')).toBeInTheDocument();
  fireEvent.keyUp(surface, { key: 'Escape' });
  expect(screen.queryByTestId('pdf-selection-rect')).toBeNull();
});

it('keeps a PDF text selection visible while its annotation toolbar is open', () => {
  const locator = { id: 'selection', page: 1, x: 0.25, y: 0.5 };
  const { result } = renderHook(() => usePdfSelectionContextMenu({
    nodeId: 'pdf-node',
    onCreateHighlightFromSelection: vi.fn()
  }));

  act(() => {
    result.current.openSelectionToolbar({
      locator,
      selectionText: 'Selected PDF text'
    }, { left: 100, top: 80 });
  });

  expect(result.current.selectionMenuState).toMatchObject({ selectionText: 'Selected PDF text' });
  expect(result.current.selectionOverlayLocator).toEqual(locator);

  act(() => result.current.closeSelectionMenu());
  expect(result.current.selectionOverlayLocator).toBeUndefined();
});
