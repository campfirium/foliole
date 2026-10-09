import { renderHook, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { resolveContextMenuSelection, useTrackPdfSelection, type PdfSelectionSnapshot } from './pdfSelectionRuntime';

afterEach(() => {
  vi.useRealTimers();
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function selectedSurface() {
  const surface = document.createElement('div');
  surface.dataset.pdfPageNumber = '1';
  const text = document.createTextNode('Both selected columns');
  surface.append(text);
  document.body.append(surface);
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.setBaseAndExtent(text, 0, text, text.length);
  const range = selection.getRangeAt(0);
  Object.defineProperty(range, 'getClientRects', { value: () => createTestDomRectList([new DOMRect(40, 700, 100, 14), new DOMRect(330, 60, 160, 14)]) });
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(40, 60, 450, 654) });
  return { surface, selection };
}

it('captures both columns on release without rewriting the native selection during dragging', () => {
  const { surface, selection } = selectedSurface();
  const snapshot: { current: PdfSelectionSnapshot | null } = { current: null };
  const { unmount } = renderHook(() => useTrackPdfSelection({ current: surface }, snapshot));
  const changeSelection = vi.spyOn(selection, 'setBaseAndExtent');
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseMove(document, { buttons: 1, clientX: 1000, clientY: 700 });
  fireEvent.mouseUp(document, { button: 0 });
  expect(changeSelection).not.toHaveBeenCalled();
  expect(snapshot.current?.selectionText).toBe('Both selected columns');
  expect(snapshot.current?.locator.rects).toHaveLength(2);
  unmount();
  snapshot.current = null;
  fireEvent.mouseUp(document, { button: 0 });
  expect(snapshot.current).toBeNull();
});

it('preserves a recent selection for a right-click menu but expires stale fallback text', () => {
  vi.useFakeTimers();
  const { surface } = selectedSurface();
  const snapshot = resolveContextMenuSelection(surface, null);
  expect(snapshot?.selectionText).toBe('Both selected columns');
  window.getSelection()?.removeAllRanges();
  expect(resolveContextMenuSelection(surface, snapshot)).toEqual(snapshot);
  vi.advanceTimersByTime(1001);
  expect(resolveContextMenuSelection(surface, snapshot)).toBeNull();
});
