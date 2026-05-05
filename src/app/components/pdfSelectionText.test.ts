import { describe, expect, it } from 'vitest';

import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

function createSelectionForNode(node: Text) {
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.textContent?.length ?? 0);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return selection;
}

describe('resolvePdfSelectionText', () => {
  it('returns selected text when the selection is inside the pdf surface', () => {
    const container = document.createElement('div');
    const textNode = document.createTextNode('Alpha beta');
    container.appendChild(textNode);
    document.body.appendChild(container);

    const selection = createSelectionForNode(textNode);
    expect(resolvePdfSelectionText(container, selection)).toBe('Alpha beta');

    selection?.removeAllRanges();
    container.remove();
  });

  it('returns empty when selection is outside the pdf surface', () => {
    const container = document.createElement('div');
    const outside = document.createElement('div');
    const outsideText = document.createTextNode('Outside text');
    outside.appendChild(outsideText);
    document.body.append(container, outside);

    const selection = createSelectionForNode(outsideText);
    expect(resolvePdfSelectionText(container, selection)).toBe('');

    selection?.removeAllRanges();
    container.remove();
    outside.remove();
  });

  it('resolves page locator when selection is inside a page shell', () => {
    const container = document.createElement('div');
    const pageShell = document.createElement('div');
    pageShell.dataset.pdfPageNumber = '3';
    const textNode = document.createTextNode('Anchor text');
    pageShell.appendChild(textNode);
    container.appendChild(pageShell);
    document.body.appendChild(container);

    Object.defineProperty(pageShell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 260, height: 200, left: 10, right: 210, top: 60, width: 200, x: 10, y: 60, toJSON: () => ({}) })
    });
    const selection = createSelectionForNode(textNode);
    const range = selection?.getRangeAt(0);
    Object.defineProperty(range as Range, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 130, height: 20, left: 60, right: 140, top: 110, width: 80, x: 60, y: 110, toJSON: () => ({}) })
    });

    expect(resolvePdfSelectionLocator(container, selection)).toEqual({ page: 3, x: 0.45, y: 0.3 });

    selection?.removeAllRanges();
    container.remove();
  });
});
