import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { usePdfSelectionToolbar } from './usePdfSelectionToolbar';

function fixture(rects: DOMRect[], reverse = false) {
  const surface = document.createElement('div');
  const nodes = rects.map((rect, index) => {
    const shell = document.createElement('div');
    shell.dataset.pdfPageNumber = String(index + 1);
    shell.innerHTML = '<div data-testid="pdf-document-page"><div class="textLayer"><span>Selected text</span></div></div>';
    const frame = shell.querySelector<HTMLElement>('[data-testid="pdf-document-page"]');
    if (frame) frame.getBoundingClientRect = () => new DOMRect(0, rect.top - 10, 1000, 1000);
    surface.append(shell);
    const node = shell.querySelector('span')?.firstChild;
    if (!(node instanceof Text)) throw new Error('Missing text');
    return node;
  });
  document.body.append(surface);
  const measure = (range: Range) => {
    Object.defineProperty(range, 'getClientRects', { value: () => {
      const index = nodes.findIndex(node => node === range.startContainer);
      return createTestDomRectList(index >= 0 ? [rects[index]!] : rects);
    } });
    Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(0, -500, 1000, 1800) });
    return range;
  };
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => measure(createRange()));
  const selection = window.getSelection();
  const first = nodes[0];
  const last = nodes.at(-1);
  if (!selection || !first || !last) throw new Error('Missing selection');
  selection.setBaseAndExtent(reverse ? last : first, reverse ? last.length : 0,
    reverse ? first : last, reverse ? 0 : last.length);
  measure(selection.getRangeAt(0));
  const onOpen = vi.fn();
  renderHook(() => usePdfSelectionToolbar({ surfaceRef: { current: surface }, onClose: vi.fn(), onOpen }));
  return { surface, onOpen };
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([false, true])('anchors cross-page selection beside the release text, reverse=%s', reverse => {
  const rects: [DOMRect, DOMRect] = [new DOMRect(100, 300, 200, 20), new DOMRect(100, 600, 200, 20)];
  const { surface, onOpen } = fixture(rects, reverse);
  const endpoint = reverse ? rects[0] : rects[1];
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseUp(surface, { button: 0, clientX: 200, clientY: endpoint.top + 10 });
  expect(onOpen).toHaveBeenCalled();
  const position = onOpen.mock.lastCall?.[1];
  expect(position.top).toBeLessThan(endpoint.top);
  expect(endpoint.top - position.top).toBeLessThan(80);
});

it.each([false, true])('anchors keyboard selection beside its focus text, reverse=%s', reverse => {
  const rects: [DOMRect, DOMRect] = [new DOMRect(100, 300, 200, 20), new DOMRect(100, 600, 200, 20)];
  const { surface, onOpen } = fixture(rects, reverse);
  fireEvent.keyUp(surface, { key: 'ArrowRight', shiftKey: true });
  const endpoint = reverse ? rects[0] : rects[1];
  const position = onOpen.mock.lastCall?.[1];
  expect(endpoint.top - position.top).toBeGreaterThan(0);
  expect(endpoint.top - position.top).toBeLessThan(80);
});

it('places a single-page toolbar below text near the top without covering it', () => {
  const rect = new DOMRect(100, 10, 200, 20);
  const { surface, onOpen } = fixture([rect]);
  fireEvent.mouseUp(surface, { button: 0, clientX: 200, clientY: 20 });
  expect(onOpen.mock.lastCall?.[1].top).toBeGreaterThanOrEqual(rect.bottom);
});

it('keeps the single-page toolbar beside the selected text', () => {
  const rect = new DOMRect(100, 300, 200, 20);
  const { surface, onOpen } = fixture([rect]);
  fireEvent.mouseUp(surface, { button: 0, clientX: 200, clientY: 310 });
  const position = onOpen.mock.lastCall?.[1];
  expect(rect.top - position.top).toBeGreaterThan(0);
  expect(rect.top - position.top).toBeLessThan(80);
  expect(position.left).toBeGreaterThanOrEqual(rect.left);
  expect(position.left).toBeLessThan(rect.right);
});

it('uses visible selected text when the other page has scrolled out of view', () => {
  const rect = new DOMRect(100, 300, 200, 20);
  const { surface, onOpen } = fixture([new DOMRect(100, -500, 200, 20), rect]);
  fireEvent.mouseUp(surface, { button: 0, clientX: 200, clientY: 310 });
  const position = onOpen.mock.lastCall?.[1];
  expect(rect.top - position.top).toBeGreaterThan(0);
  expect(rect.top - position.top).toBeLessThan(80);
});

it('keeps all actions inside the viewport when release is beyond the bottom right edge', () => {
  const rect = new DOMRect(window.innerWidth - 120, window.innerHeight - 30, 110, 20);
  const { surface, onOpen } = fixture([rect]);
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseUp(document, { button: 0, clientX: window.innerWidth + 200, clientY: window.innerHeight + 200 });
  const position = onOpen.mock.lastCall?.[1];
  expect(position.left + 118).toBeLessThanOrEqual(window.innerWidth - 8);
  expect(position.top + 42).toBeLessThanOrEqual(window.innerHeight - 8);
});
