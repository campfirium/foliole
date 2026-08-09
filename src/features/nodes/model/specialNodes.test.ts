import { describe, expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  ensureInboxNodeInSnapshot,
  HOME_NODE_ID,
  INBOX_NODE_ID,
  isHomeNode,
  isInboxNode,
  isVirtualNode,
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

    expect(snapshot.nodeOrder).toEqual([HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'node-1']);
    expect(snapshot.activeNodeId).toBe('node-1');
    expect(isHomeNode(snapshot.nodesById[HOME_NODE_ID])).toBe(true);
    expect(isInboxNode(snapshot.nodesById[INBOX_NODE_ID])).toBe(true);
    expect(isVirtualRootNode(snapshot.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
    expect(snapshot.nodesById[HOME_NODE_ID]?.title).toBe('Home');
    expect(snapshot.nodesById[INBOX_NODE_ID]?.title).toBe('Inbox');
    expect(snapshot.nodesById[VIRTUAL_ROOT_NODE_ID]?.title).toBe('Virtual');
    expect(snapshot.trashedNodeIds).toEqual([]);
  });

  it('preserves explicit root order when all injected roots already exist', () => {
    const nodesById: Record<string, Node> = {
      [HOME_NODE_ID]: createNode(HOME_NODE_ID, 'Home'),
      'guides': createNode('guides', 'Guides'),
      [INBOX_NODE_ID]: createNode(INBOX_NODE_ID, 'Inbox'),
      [VIRTUAL_ROOT_NODE_ID]: createNode(VIRTUAL_ROOT_NODE_ID, 'Virtual')
    };
    const snapshot = ensureInboxNodeInSnapshot({
      activeNodeId: 'guides',
      nodeOrder: [HOME_NODE_ID, 'guides', INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID],
      nodesById,
      trashedNodeIds: []
    });

    expect(snapshot.nodeOrder).toEqual([HOME_NODE_ID, 'guides', INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
    expect(isInboxNode(snapshot.nodesById[INBOX_NODE_ID])).toBe(true);
    expect(isVirtualRootNode(snapshot.nodesById[VIRTUAL_ROOT_NODE_ID])).toBe(true);
  });

  it('preserves virtual identity for folders nested below another virtual folder', () => {
    const parent = { ...createNode('virtual-parent', 'Parent'), kind: 'folder' as const, parentNodeId: VIRTUAL_ROOT_NODE_ID };
    const child = {
      ...createNode('virtual-child', 'Child'),
      kind: 'folder' as const,
      parentNodeId: parent.id,
      virtualFilter: { conditions: [{ field: 'manual' as const, operator: 'equals' as const, value: 'manual-child-order' }], match: 'all' as const, version: 1 as const }
    };
    const snapshot = ensureInboxNodeInSnapshot({
      activeNodeId: child.id,
      nodeOrder: [parent.id, child.id],
      nodesById: { [parent.id]: parent, [child.id]: child },
      trashedNodeIds: []
    });

    expect(isVirtualNode(snapshot.nodesById[child.id])).toBe(true);
    expect(snapshot.nodesById[child.id]?.parentNodeId).toBe(parent.id);
  });
});
