import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import { projectWorkspaceListNodesById } from './workspaceListNode';

function createTopicNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Atlas',
    content: 'Version 1',
    reveal: '',
    review: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
    ...overrides
  };
}

it('keeps the list projection stable when a body save only advances updatedAt', () => {
  const initialProjection = projectWorkspaceListNodesById({ 'node-1': createTopicNode() });
  const nextProjection = projectWorkspaceListNodesById(
    {
      'node-1': createTopicNode({
        content: 'Version 2',
        updatedAt: '2026-04-08T00:00:01.000Z'
      })
    },
    initialProjection
  );

  expect(nextProjection).toBe(initialProjection);
  expect(nextProjection['node-1']).toBe(initialProjection['node-1']);
});
