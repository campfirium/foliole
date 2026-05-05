import type { MutableRefObject } from 'react';
import { expect, it } from 'vitest';

import { collectMatches } from './PdfDocumentSearch';

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
