import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import { toWorkspaceListNode } from './workspaceListNode';

it('keeps the list-layer projection lightweight', () => {
  const heavyNode: Node = {
    id: 'node-1',
    parentNodeId: null,
    title: 'Atlas',
    content: 'Long body '.repeat(500),
    reveal: 'Answer '.repeat(200),
    review: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  };

  const listNode = toWorkspaceListNode(heavyNode);

  expect(listNode).toMatchObject({
    hasContent: true,
    hasReveal: true,
    id: 'node-1',
    title: 'Atlas'
  });
  expect(Object.keys(listNode)).not.toContain('content');
  expect(Object.keys(listNode)).not.toContain('reveal');
});
