import { describe, expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import {
  resolveReviewFirstChildNodeId,
  resolveReviewSiblingNodeId,
  resolveReviewSourceTopicNodeId
} from './reviewGameNavigation';

function node(partial: Partial<Node> & Pick<Node, 'id'>): Node {
  const { id, ...rest } = partial;
  return {
    id,
    parentNodeId: partial.parentNodeId ?? null,
    kind: partial.kind ?? 'topic',
    title: partial.title ?? partial.id,
    content: '',
    reveal: null,
    reading: null,
    review: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z',
    ...rest
  };
}

describe('review game navigation', () => {
  it('resolves available siblings and first child in node order', () => {
    const nodes = [
      node({ id: 'parent' }),
      node({ id: 'first', parentNodeId: 'parent' }),
      node({ id: 'trashed', parentNodeId: 'parent' }),
      node({ id: 'second', parentNodeId: 'parent' })
    ];
    const source = {
      nodeOrder: nodes.map((entry) => entry.id),
      nodesById: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
      trashedNodeIds: ['trashed']
    };

    expect(resolveReviewFirstChildNodeId('parent', source)).toBe('first');
    expect(resolveReviewSiblingNodeId('first', 1, source)).toBe('second');
    expect(resolveReviewSiblingNodeId('second', -1, source)).toBe('first');
  });

  it('resolves the native source topic and aborts on unavailable chains', () => {
    const sourceTopic = node({ id: 'source' });
    const anchoredTopic = node({
      id: 'anchored',
      parentNodeId: 'source',
      anchorLink: { id: 'a1', kind: 'highlight' }
    });
    const item = node({ id: 'item', kind: 'item', parentNodeId: 'anchored' });
    const nodesById = { source: sourceTopic, anchored: anchoredTopic, item };

    expect(resolveReviewSourceTopicNodeId('item', { nodesById, trashedNodeIds: [] })).toBe('source');
    expect(resolveReviewSourceTopicNodeId('item', { nodesById, trashedNodeIds: ['source'] })).toBeNull();
  });
});
