import { describe, expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  ensureInboxNodeInSnapshot,
  INBOX_NODE_ID,
  isInboxNode,
  isVirtualRootNode,
  VIRTUAL_ROOT_NODE_ID
} from './specialNodes';

function createNode(id: string, title: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title,
    content: title,
    reveal: null,
    review: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('ensureInboxNodeInSnapshot', () => {
  it('injects Inbox at the top level for older snapshots', () => {
    const nodesById: Record<string, Node> = {
      'node-1': createNode('node-1', 'Welcome')
    };
    const snapshot = ensureInboxNodeInSnapshot({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1'],
      nodesById,
      trashedNodeIds: []
    });

    expect(snapshot.nodeOrder).toEqual([INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'node-1']);
    expect(snapshot.activeNodeId).toBe('node-1');
    expect(isInboxNode(snapshot.nodesById[INBOX_NODE_ID])).toBe(true);
    expect(isVirtualRootNode(snapshot.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
    expect(snapshot.nodesById[INBOX_NODE_ID]?.title).toBe('Inbox');
    expect(snapshot.nodesById[VIRTUAL_ROOT_NODE_ID]?.title).toBe('Virtual Nodes');
    expect(snapshot.trashedNodeIds).toEqual([]);
  });
});
