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
  textLayer.appendChild(span);
  page.appendChild(textLayer);
  shell.appendChild(page);

  const originalGetBounding = Range.prototype.getBoundingClientRect;
  const originalGetClientRects = Range.prototype.getClientRects;
  Range.prototype.getBoundingClientRect = () => createRect({ height: 20, left: 10, top: 40, width: 30 });
  Range.prototype.getClientRects = () => [createRect({ height: 20, left: 10, top: 40, width: 30 })] as unknown as DOMRectList;

  const matches = collectMatches(createPageElementsRef(shell), 1, 'hello');

  Range.prototype.getBoundingClientRect = originalGetBounding;
  Range.prototype.getClientRects = originalGetClientRects;

  expect(matches).toHaveLength(1);
  expect(matches[0]?.rects[0]).toEqual({ height: 0.1, width: 0.3, x: 0.1, y: 0.2 });
  expect(matches[0]?.x).toBeCloseTo(0.25);
  expect(matches[0]?.y).toBeCloseTo(0.25);
});
