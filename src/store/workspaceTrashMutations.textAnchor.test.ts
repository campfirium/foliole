import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { computeDeleteNodesMutation } from './workspaceTrashMutations';

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

describe('workspaceTrashMutations text anchors', () => {
  it('keeps inline text anchors in parent content during soft delete', () => {
    const parentNode = createNode({
      id: 'parent',
      content: 'before <cloze id="1">answer</cloze id="1"> after',
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
      {
        activeNodeId: 'parent',
        navigation: { backStack: [], forwardStack: [] },
        nodeOrder: ['parent', 'child'],
        nodesById: { parent: parentNode, child: childNode },
        reviewSession: { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 },
        trashedNodeIds: []
      } as never,
      ['child']
    );

    expect(mutation?.patch.nodesById.parent.content).toBe('before <cloze id="1">answer</cloze id="1"> after');
    expect(mutation?.parentNodesToSync).toEqual([]);
  });
});
