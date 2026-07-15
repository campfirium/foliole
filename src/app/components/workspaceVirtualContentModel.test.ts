import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

function createTopic(id: string): Node {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

it('resolves a real virtual node from the shared result index', () => {
  const virtualNode: Node = {
    content: '', createdAt: '2026-05-01T00:00:00.000Z', id: 'virtual-a', kind: 'folder',
    parentNodeId: 'special-virtual-root', reveal: null, review: null, specialKind: 'virtual',
    title: 'Virtual A', updatedAt: '2026-05-01T00:00:00.000Z'
  };
  expect(resolveVirtualContentItemIds({
    activeVirtualNodeId: 'virtual-a',
    nodeOrder: ['virtual-a', 'topic-a', 'topic-b'],
    nodesById: {
      'virtual-a': virtualNode,
      'topic-a': createTopic('topic-a'),
      'topic-b': createTopic('topic-b')
    },
    trashedNodeIds: []
  }, {
    resultIdsByVirtualId: new Map([['virtual-a', ['topic-b', 'topic-a']]])
  } as Parameters<typeof resolveVirtualContentItemIds>[1])).toEqual(['topic-b', 'topic-a']);
});
