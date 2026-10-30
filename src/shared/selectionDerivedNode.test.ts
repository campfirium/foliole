import { expect, it } from 'vitest';

import type { NodeAnchorLink } from '../features/nodes/model/nodeTypes';

import { prepareSelectionDerivedNode } from './selectionDerivedNode';

const item = { id: 'item', kind: 'item', parentNodeId: 'topic', content: 'First [...] then [...] end', reveal: 'Alpha\nBeta' };

function clozeSelection(from: number, to: number, originalText: string): NodeAnchorLink {
  return { id: 'new-cloze', kind: 'cloze', locator: { from, to, originalText } };
}

it('restores multiple old blanks while selecting fresh text for a sibling cloze', () => {
  expect(prepareSelectionDerivedNode(item, { content: 'First [...] then [...] [...]', reveal: 'end',
    anchorLink: clozeSelection(23, 26, 'end') })).toMatchObject({
    content: 'First Alpha then Beta [...]', reveal: 'end', parentNodeId: 'topic', anchorLink: null
  });
});

it('can select the old blank as the new cloze without losing its restored answer', () => {
  expect(prepareSelectionDerivedNode(item, { content: item.content, reveal: '[...]',
    anchorLink: clozeSelection(6, 11, '[...]') })).toMatchObject({ content: 'First [...] then Beta end', reveal: 'Alpha' });
});

it('keeps manual question and answer Items independent of the parent wording', () => {
  expect(prepareSelectionDerivedNode({ ...item, content: 'An edited question?', reveal: 'A custom answer' },
    { content: 'An [...] question?', reveal: 'edited', anchorLink: clozeSelection(3, 9, 'edited') }))
    .toMatchObject({ parentNodeId: 'topic', content: 'An [...] question?', reveal: 'edited', anchorLink: null });
});

it('uses exact original multi-range answers when one of them contains a newline', () => {
  const source = { ...item, reveal: 'Alpha\nline two\nBeta', anchorLink: { id: 'old', kind: 'cloze' as const,
    locator: { ranges: [{ from: 0, to: 14, originalText: 'Alpha\nline two' }, { from: 20, to: 24, originalText: 'Beta' }] } } };
  expect(prepareSelectionDerivedNode(source, { content: item.content, reveal: '[...]',
    anchorLink: clozeSelection(6, 11, '[...]') })).toMatchObject({ content: 'First [...] then Beta end', reveal: 'Alpha\nline two' });
});

it('refuses an ambiguous multi-blank answer rather than substituting invented text', () => {
  expect(() => prepareSelectionDerivedNode({ ...item, reveal: 'Alpha\nnew line\nBeta' },
    { content: 'First [...] then [...] [...]', reveal: 'end', anchorLink: clozeSelection(23, 26, 'end') }))
    .toThrow('cannot be matched');
});

it('rejects stale selection coordinates when restoration needs the current Item text', () => {
  expect(() => prepareSelectionDerivedNode(item, { content: '[...]', reveal: 'old text',
    anchorLink: clozeSelection(0, 8, 'old text') })).toThrow('Select the text again');
});
