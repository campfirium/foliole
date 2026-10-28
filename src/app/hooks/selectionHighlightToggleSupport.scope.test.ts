import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { findExactLocatorHighlight } from './selectionHighlightToggleSupport';

const locator = { from: 6, originalText: 'Beta', to: 10 };

function highlight(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id, parentNodeId: 'source', kind: 'topic', title: 'Beta', content: 'Beta',
    createdAt: '', updatedAt: '', reveal: null, review: null,
    anchorLink: { id, kind: 'highlight', locator }, ...overrides
  };
}

for (const size of [100, 1000, 10000]) {
  it(`does not read ${size} unrelated records after the first exact match`, () => {
    let reads = 0;
    const nodes: Record<string, Node> = { first: highlight('first'), second: highlight('second') };
    for (let index = 0; index < size; index += 1) {
      Object.defineProperty(nodes, `unrelated-${index}`, {
        enumerable: true,
        get: () => { reads += 1; return highlight(`unrelated-${index}`, { parentNodeId: 'other' }); }
      });
    }
    expect(findExactLocatorHighlight('source', nodes, locator, [])).toEqual({
      kind: 'highlight', canAdjustRange: true, locator, nodeId: 'first', originalText: 'Beta'
    });
    expect(reads).toBe(0);
  });
}

it('keeps first-match order while rejecting trash, other parents and inexact or invalid locators', () => {
  const nodes = {
    trash: highlight('trash'),
    other: highlight('other', { parentNodeId: 'other' }),
    cloze: highlight('cloze', { anchorLink: { id: 'cloze', kind: 'cloze', locator } }),
    invalid: highlight('invalid', { anchorLink: { id: 'invalid', kind: 'highlight' } }),
    from: highlight('from', { anchorLink: { id: 'from', kind: 'highlight', locator: { ...locator, from: 5 } } }),
    to: highlight('to', { anchorLink: { id: 'to', kind: 'highlight', locator: { ...locator, to: 11 } } }),
    text: highlight('text', { anchorLink: { id: 'text', kind: 'highlight', locator: { ...locator, originalText: 'beta' } } }),
    first: highlight('first'), second: highlight('second')
  };
  expect(findExactLocatorHighlight('source', nodes, locator, ['trash'])?.nodeId).toBe('first');
  expect(findExactLocatorHighlight('source', nodes, locator, ['trash', 'first'])?.nodeId).toBe('second');
  expect(findExactLocatorHighlight('source', nodes, locator, ['trash', 'first', 'second'])).toBeNull();
});

it('ignores inherited and non-enumerable matching records', () => {
  const nodes: Record<string, Node> = Object.create({ inherited: highlight('inherited') });
  Object.defineProperty(nodes, 'hidden', { value: highlight('hidden') });
  nodes.visible = highlight('visible');
  expect(findExactLocatorHighlight('source', nodes, locator, [])?.nodeId).toBe('visible');
});
