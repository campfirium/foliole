import type { MutableRefObject } from 'react';
import { expect, it } from 'vitest';

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
  return {
    current: {
      1: root
    }
  };
}

it('finds matches that span across multiple text-layer spans', () => {
  const shell = document.createElement('div');
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const spanA = document.createElement('span');
  spanA.setAttribute('role', 'presentation');
  spanA.textContent = 'hello';
  const spanB = document.createElement('span');
  spanB.setAttribute('role', 'presentation');
  spanB.textContent = ' world';
  textLayer.append(spanA, spanB);
  shell.appendChild(textLayer);

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello world');

  expect(matches).toHaveLength(1);
  expect(matches[0]?.page).toBe(1);
  expect(matches[0]?.element).toBe(spanA);
});

it('ignores markedContent wrapper spans and counts the text only once', () => {
  const shell = document.createElement('div');
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';

  const wrapper = document.createElement('span');
  wrapper.className = 'markedContent';
  const leaf = document.createElement('span');
  leaf.setAttribute('role', 'presentation');
  leaf.textContent = 'Hello World';
  wrapper.appendChild(leaf);
  textLayer.appendChild(wrapper);
  shell.appendChild(textLayer);

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello world');

  expect(matches).toHaveLength(1);
  expect(matches[0]?.page).toBe(1);
  expect(matches[0]?.element).toBe(leaf);
});

it('maps a match range to normalized page rect position', () => {
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  page.getBoundingClientRect = () => createRect({ height: 200, left: 0, top: 0, width: 100 });
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  const span = document.createElement('span');
  span.setAttribute('role', 'presentation');
  span.textContent = 'hello world';
  const textNode = span.firstChild as Text;
  span.getBoundingClientRect = () => createRect({ height: 20, left: 10, top: 40, width: 55 });
  textLayer.appendChild(span);
  page.appendChild(textLayer);
  shell.appendChild(page);
  const originalCreateRange = document.createRange.bind(document);
  document.createRange = () => {
    const range = originalCreateRange();
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => [{ bottom: 60, height: 20, left: 10, right: 35, top: 40, width: 25, x: 10, y: 40, toJSON: () => ({}) }] as unknown as DOMRectList
    });
    Object.defineProperty(range, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect({ height: 20, left: 10, top: 40, width: 25 })
    });
    return range;
  };

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello');

  expect(matches).toHaveLength(1);
  expect(textNode.textContent).toBe('hello world');
  expect(matches[0]?.rects[0]).toEqual({ height: 0.1, width: 0.25, x: 0.1, y: 0.2 });
  expect(matches[0]?.x).toBeCloseTo(0.225);
  expect(matches[0]?.y).toBeCloseTo(0.25);
  document.createRange = originalCreateRange;
});

it('collects rects from all overlapped spans for cross-span matches', () => {
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
  spanB.textContent = ' world';
  spanB.getBoundingClientRect = () => createRect({ height: 16, left: 30, top: 36, width: 36 });
  textLayer.append(spanA, spanB);
  page.appendChild(textLayer);
  shell.appendChild(page);

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello world');

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects).toEqual([
    { height: 0.08, width: 0.2, x: 0.08, y: 0.18 },
    { height: 0.08, width: 0.36, x: 0.3, y: 0.18 }
  ]);
  expect(matches[0]?.x).toBeCloseTo(0.18);
  expect(matches[0]?.y).toBeCloseTo(0.22);
});

it('keeps match without visible rect before text layer segments are ready', () => {
  const shell = document.createElement('div');
  shell.getBoundingClientRect = () => createRect({ height: 300, left: 10, top: 20, width: 200 });

  const matches = collectMatches(
    createPageElementsRef(shell),
    1,
    'keyword',
    {
      current: {
        1: 'keyword appears before text layer render'
      }
    }
  );

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects).toEqual([]);
  expect(matches[0]?.x).toBeNull();
  expect(matches[0]?.y).toBeNull();
});
