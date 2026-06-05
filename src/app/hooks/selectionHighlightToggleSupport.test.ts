import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { findExactLocatorHighlight, findTextAnchorAtPosition } from './selectionHighlightToggleSupport';

it('finds an existing cloze at the editor cursor position', () => {
  const nodesById = {
    'node-1': { content: 'Alpha Beta', id: 'node-1', title: 'Topic' },
    'cloze-1': {
      anchorLink: { id: 'cloze-anchor', kind: 'cloze', locator: { from: 6, originalText: 'Beta', to: 10 } },
      content: '[...]',
      id: 'cloze-1',
      parentNodeId: 'node-1',
      reveal: 'Beta',
      title: 'Beta'
    }
  } as unknown as Record<string, Node>;

  expect(findTextAnchorAtPosition('node-1', nodesById, 6, [])).toEqual({
    canAdjustRange: true,
    kind: 'cloze',
    locator: { from: 6, originalText: 'Beta', to: 10 },
    nodeId: 'cloze-1',
    originalText: 'Beta'
  });
});

it('keeps highlight toggle matching scoped to highlights', () => {
  const nodesById = {
    'node-1': { content: 'Alpha Beta', id: 'node-1', title: 'Topic' },
    'cloze-1': {
      anchorLink: { id: 'cloze-anchor', kind: 'cloze', locator: { from: 6, originalText: 'Beta', to: 10 } },
      content: '[...]',
      id: 'cloze-1',
      parentNodeId: 'node-1',
      reveal: 'Beta',
      title: 'Beta'
    }
  } as unknown as Record<string, Node>;

  expect(findExactLocatorHighlight('node-1', nodesById, { from: 6, originalText: 'Beta', to: 10 }, [])).toBeNull();
});
