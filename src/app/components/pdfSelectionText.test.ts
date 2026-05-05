import { describe, expect, it } from 'vitest';

import { resolvePdfSelectionText } from './pdfSelectionText';

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
});
