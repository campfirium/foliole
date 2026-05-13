import type { MutableRefObject } from 'react';
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

function createPageElementsRef(root: HTMLDivElement): MutableRefObject<Record<number, HTMLDivElement | null>> {
  return { current: { 1: root } };
}

it('maps indexed char-range to text-item rects even when rendered text segmentation differs', () => {
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  page.getBoundingClientRect = () => createRect({ height: 200, left: 0, top: 0, width: 100 });
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const spanA = document.createElement('span');
  spanA.setAttribute('role', 'presentation');
  spanA.textContent = 'hello';
  spanA.getBoundingClientRect = () => createRect({ height: 16, left: 8, top: 36, width: 20 });
  const spanB = document.createElement('span');
  spanB.setAttribute('role', 'presentation');
  spanB.textContent = 'world';
  spanB.getBoundingClientRect = () => createRect({ height: 16, left: 30, top: 36, width: 30 });
  textLayer.append(spanA, spanB);
  page.appendChild(textLayer);
  shell.appendChild(page);

  const matches = collectMatches(
    createPageElementsRef(shell),
    1,
    'hello world',
    {
      current: {
        1: {
          itemRanges: [
            { end: 5, start: 0 },
            { end: 11, start: 5 }
          ],
          text: 'hello world'
        }
      }
    }
  );

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects).toEqual([
    { height: 0.08, width: 0.2, x: 0.08, y: 0.18 },
    { height: 0.08, width: 0.3, x: 0.3, y: 0.18 }
  ]);
  expect(matches[0]?.x).toBeCloseTo(0.18);
  expect(matches[0]?.y).toBeCloseTo(0.22);
});

it('keeps indexed geometry when current-page structure data is available', () => {
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  page.getBoundingClientRect = () => createRect({ height: 200, left: 0, top: 0, width: 100 });
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const span = document.createElement('span');
  span.setAttribute('role', 'presentation');
  span.textContent = 'keyword';
  span.getBoundingClientRect = () => createRect({ height: 20, left: 15, top: 60, width: 35 });
  textLayer.appendChild(span);
  page.appendChild(textLayer);
  shell.appendChild(page);

  const originalCreateRange = document.createRange.bind(document);
  document.createRange = () => {
    const range = originalCreateRange();
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => createTestDomRectList([])
    });
    Object.defineProperty(range, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect({ height: 0, left: 0, top: 0, width: 0 })
    });
    return range;
  };

  const matches = collectMatches(
    createPageElementsRef(shell),
    1,
    'keyword',
    {
      current: {
        1: {
          itemRanges: [{ end: 7, start: 0 }],
          text: 'keyword'
        }
      }
    }
  );

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects.length).toBeGreaterThan(0);
  expect(matches[0]?.x).not.toBeNull();
  expect(matches[0]?.y).not.toBeNull();
  document.createRange = originalCreateRange;
});

it('uses current page text-layer structure only when indexed page text is absent', () => {
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  page.getBoundingClientRect = () => createRect({ height: 200, left: 0, top: 0, width: 100 });
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const span = document.createElement('span');
  span.setAttribute('role', 'presentation');
  span.textContent = 'hello world';
  span.getBoundingClientRect = () => createRect({ height: 20, left: 15, top: 60, width: 50 });
  textLayer.appendChild(span);
  page.appendChild(textLayer);
  shell.appendChild(page);

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello world');

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects.length).toBeGreaterThan(0);
  expect(matches[0]?.x).not.toBeNull();
  expect(matches[0]?.y).not.toBeNull();
});
