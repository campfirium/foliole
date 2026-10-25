import { Virtualizer } from '@tanstack/react-virtual';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useVirtualListViewportRemeasure } from './virtualListViewportRemeasure';

function RemeasureHarness(props: {
  isVirtual?: boolean;
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  useVirtualListViewportRemeasure({ isVirtual: props.isVirtual ?? true, virtualizer: props.virtualizer });
  return null;
}

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createMeasuredList() {
  const scroll = document.createElement('div');
  document.body.append(scroll);
  Object.defineProperty(scroll, 'scrollHeight', { value: 20000 });
  const heights = [142, 148, 151];
  const rows = heights.map((_, index) => {
    const row = document.createElement('div');
    row.dataset.index = String(index);
    Object.defineProperty(row, 'offsetHeight', { get: () => heights[index] });
    scroll.append(row);
    return row;
  });
  const virtualizer = new Virtualizer<HTMLElement, Element>({
    count: 100,
    estimateSize: () => 124,
    getScrollElement: () => scroll,
    initialRect: { width: 393, height: 300 },
    observeElementOffset: () => undefined,
    observeElementRect: () => undefined,
    scrollToFn: () => undefined
  });
  virtualizer._willUpdate();
  virtualizer.getTotalSize();
  return { heights, rows, virtualizer };
}

function expectRowOffsets(virtualizer: Virtualizer<HTMLElement, Element>, heights: number[]) {
  virtualizer.getTotalSize();
  expect(virtualizer.getOffsetForIndex(1, 'start')?.[0]).toBe(heights[0]);
  expect(virtualizer.getOffsetForIndex(2, 'start')?.[0]).toBe(heights[0]! + heights[1]!);
}

it.each([false, true])('retains actual row spacing after a height change while scrolling is %s', (scrolling) => {
  const { heights, rows, virtualizer } = createMeasuredList();
  render(<RemeasureHarness virtualizer={virtualizer} />);
  rows.forEach(virtualizer.measureElement);
  expectRowOffsets(virtualizer, heights);
  virtualizer.isScrolling = scrolling;

  window.dispatchEvent(new Event('resize'));

  expectRowOffsets(virtualizer, heights);
});

it('updates row spacing when viewport changes alter the row heights', () => {
  const { heights, rows, virtualizer } = createMeasuredList();
  render(<RemeasureHarness virtualizer={virtualizer} />);
  rows.forEach(virtualizer.measureElement);
  heights[0] = 165;
  heights[1] = 171;

  window.dispatchEvent(new Event('resize'));

  expectRowOffsets(virtualizer, heights);
});

it('retains measured spacing when the document becomes visible again', () => {
  const { heights, rows, virtualizer } = createMeasuredList();
  render(<RemeasureHarness virtualizer={virtualizer} />);
  rows.forEach(virtualizer.measureElement);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

  document.dispatchEvent(new Event('visibilitychange'));

  expectRowOffsets(virtualizer, heights);
});

it('does not remeasure static rows', () => {
  const { heights, rows, virtualizer } = createMeasuredList();
  rows.forEach(virtualizer.measureElement);
  render(<RemeasureHarness isVirtual={false} virtualizer={virtualizer} />);
  heights[0] = 165;

  window.dispatchEvent(new Event('resize'));

  virtualizer.getTotalSize();
  expect(virtualizer.getOffsetForIndex(1, 'start')?.[0]).toBe(142);
});
