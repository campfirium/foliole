import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { computeDeleteNodesMutation, computeDeleteNodesPermanentlyMutation } from './workspaceTrashMutations';

function createNode(overrides: Partial<Node> & Pick<Node, 'id'>): Node {
  return {
    id: overrides.id,
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? overrides.id,
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-10T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-10T00:00:00.000Z',
    ...(overrides.imageRegions ? { imageRegions: overrides.imageRegions } : {}),
    ...(typeof overrides.hasContent === 'boolean' ? { hasContent: overrides.hasContent } : {}),
    ...(typeof overrides.hasReveal === 'boolean' ? { hasReveal: overrides.hasReveal } : {})
  };
}

function createWorkspaceState(nodesById: Record<string, Node>, trashedNodeIds: string[] = []) {
  return {
    activeNodeId: 'parent',
    navigation: { backStack: [], forwardStack: [] },
    nodeOrder: Object.keys(nodesById),
    nodesById,
    reviewSession: { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 },
    trashedNodeIds
  } as never;
}

describe('computeDeleteNodesMutation', () => {
  it('keeps parent content unchanged during soft delete', () => {
    const parentNode = createNode({
      id: 'parent',
      content: 'before answer after',
      hasContent: true
    });
    const childNode = createNode({
      id: 'child',
      parentNodeId: 'parent',
      kind: 'item',
      content: 'before [...] after',
      anchorLink: { id: '1', kind: 'cloze' },
      reveal: 'answer',
      hasContent: true,
      hasReveal: true
    });

    const mutation = computeDeleteNodesMutation(
      createWorkspaceState({ parent: parentNode, child: childNode }),
      ['child']
    );

    expect(mutation?.patch.nodesById.parent.content).toBe('before answer after');
    expect(mutation?.parentNodesToSync).toEqual([]);
  });

  it('keeps pure markdown parent content unchanged when soft deleting an unresolved locator highlight', () => {
    const parentNode = createNode({
      id: 'parent',
      content: 'before answer after',
      hasContent: true
    });
    const childNode = createNode({
      id: 'child',
      parentNodeId: 'parent',
      kind: 'topic',
      content: 'answer',
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 7, originalText: 'answer', to: 7 }
      },
      hasContent: true
    });

    const mutation = computeDeleteNodesMutation(
      createWorkspaceState({ parent: parentNode, child: childNode }),
      ['child']
    );

    expect(mutation?.patch.nodesById.parent.content).toBe('before answer after');
    expect(mutation?.parentNodesToSync).toEqual([]);
    expect(mutation?.patch.trashedNodeIds).toEqual(['child']);
  });
});

function expectPermanentDeleteResult(args: {
  childAnchorLink: Node['anchorLink'];
  expectedContent: string;
  expectedSyncedParentCount: number;
  parentContent: string;
  parentTitle?: string;
}) {
  const parentNode = createNode({
    id: 'parent',
    content: args.parentContent,
    hasContent: true,
    title: args.parentTitle ?? 'parent'
  });
  const childNode = createNode({
    id: 'child',
    parentNodeId: 'parent',
    kind: 'item',
    content: 'answer',
    anchorLink: args.childAnchorLink,
    hasContent: true
  });

  const mutation = computeDeleteNodesPermanentlyMutation(
    createWorkspaceState({ parent: parentNode, child: childNode }, ['child']),
    ['child']
  );

  expect(mutation?.patch.nodesById.parent.content).toBe(args.expectedContent);
  expect(mutation?.parentNodesToSync).toHaveLength(args.expectedSyncedParentCount);
  return mutation;
}

describe('computeDeleteNodesPermanentlyMutation', () => {
  it('keeps parent content unchanged during permanent delete', () => {
    const mutation = expectPermanentDeleteResult({
      childAnchorLink: { id: 'anchor-1', kind: 'highlight' },
      expectedContent: 'before answer after',
      expectedSyncedParentCount: 0,
      parentContent: 'before answer after'
    });

    expect(mutation?.patch.nodesById.parent.title).toBe('parent');
  });

  it('keeps pure markdown parent content unchanged for locator-era highlights', () => {
    const mutation = expectPermanentDeleteResult({
      childAnchorLink: { id: 'anchor-1', kind: 'highlight' },
      expectedContent: 'before answer after',
      expectedSyncedParentCount: 0,
      parentContent: 'before answer after'
    });

    expect(mutation?.patch.nodesById.parent.title).toBe('parent');
  });

  it('keeps locator-backed highlights from rewriting parent content during permanent delete', () => {
    const mutation = expectPermanentDeleteResult({
      childAnchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 7, originalText: 'answer', to: 13 }
      },
      expectedContent: 'before answer after',
      expectedSyncedParentCount: 0,
      parentContent: 'before answer after'
    });

    expect(mutation?.patch.nodesById.parent.title).toBe('parent');
  });

  it('keeps unresolved zero-width locator highlights from rewriting parent content during permanent delete', () => {
    const mutation = expectPermanentDeleteResult({
      childAnchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 7, originalText: 'answer', to: 7 }
      },
      expectedContent: 'before answer after',
      expectedSyncedParentCount: 0,
      parentContent: 'before answer after'
    });

    expect(mutation?.patch.nodesById.parent.title).toBe('parent');
  });
});
