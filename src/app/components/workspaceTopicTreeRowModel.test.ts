import { expect, it } from 'vitest';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { resolveWorkspaceTopicTreeRowModel } from './workspaceTopicTreeRowModel';

function row(id: string): NodeTreeRow {
  return {
    depth: 0,
    descendantCount: 0,
    hasChildren: false,
    node: node(id)
  };
}

function node(id: string): WorkspaceListNode {
  return {
    anchorLink: null,
    createdAt: '',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: 'book-root',
    review: null,
    title: id,
    updatedAt: ''
  };
}

it('disables drag affordance only for generated EPUB descendants', () => {
  const generatedId = 'node-epub-0123456789abcdef01234567';
  const userId = 'user-note';
  const nodesById = {
    [generatedId]: node(generatedId),
    [userId]: node(userId)
  } satisfies WorkspaceListNodesById;
  const args = { collapsedNodeIds: new Set<string>(), nodesById, selectedNodeIds: [] };

  expect(resolveWorkspaceTopicTreeRowModel(row(generatedId), args).isDragDisabled).toBe(true);
  expect(resolveWorkspaceTopicTreeRowModel(row(userId), args).isDragDisabled).toBe(false);
});
