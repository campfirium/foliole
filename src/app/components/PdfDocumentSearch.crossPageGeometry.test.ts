import { expect, it } from 'vitest';

import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { collectMatches } from './PdfDocumentSearch';

function createRect({ height, left, top, width }: { height: number; left: number; top: number; width: number }) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

function createCrossPageShell(text: string, rect: { height: number; left: number; top: number; width: number }) {
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  page.getBoundingClientRect = () => createRect({ height: 200, left: 0, top: 0, width: 100 });
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const span = document.createElement('span');
  span.setAttribute('role', 'presentation');
  span.textContent = text;
  span.getBoundingClientRect = () => createRect(rect);
  textLayer.append(span);
  page.append(textLayer);
  shell.append(page);
  return { shell, span };
}

function withMockedCrossPageRanges(spanA: HTMLElement, run: () => void) {
  const originalCreateRange = document.createRange.bind(document);
  document.createRange = () => {
    const range = originalCreateRange();
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => {
        const node = (range.startContainer.parentElement ?? range.commonAncestorContainer.parentElement) as HTMLElement | null;
        if (node === spanA) {
          return createTestDomRectList([
            { bottom: 52, height: 16, left: 28, right: 38, top: 36, width: 10, x: 28, y: 36, toJSON: () => ({}) } as DOMRect
          ]);
        }
        return createTestDomRectList([
          { bottom: 56, height: 16, left: 10, right: 24, top: 40, width: 14, x: 10, y: 40, toJSON: () => ({}) } as DOMRect
        ]);
      }
    });
    Object.defineProperty(range, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect({ height: 16, left: 10, top: 40, width: 14 })
    });
    return range;
  };
  try {
    run();
  } finally {
    document.createRange = originalCreateRange;
  }
}

it('keeps cross-page matches as one result while exposing highlight geometry on both pages', () => {
  const first = createCrossPageShell('alpha bri', { height: 16, left: 8, top: 36, width: 30 });
  const second = createCrossPageShell('dge omega', { height: 16, left: 10, top: 40, width: 34 });

  withMockedCrossPageRanges(first.span, () => {
    const matches = collectMatches(
      {
        current: {
          1: first.shell,
          2: second.shell
        }
      },
      2,
      'bridge'
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.fragments?.map((fragment) => fragment.page)).toEqual([1, 2]);
    expect(matches[0]?.fragments?.[0]?.rects.length).toBeGreaterThan(0);
    expect(matches[0]?.fragments?.[1]?.rects.length).toBeGreaterThan(0);
  });
});
