import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  buildVirtualNodeResultIndex,
  createVirtualNodeFilterFromKeyword
} from './virtualNodeDetail';

const baseNode: Node = {
  id: 'node-1',
  parentNodeId: null,
  kind: 'topic',
  title: 'Base node',
  isTitleManual: true,
  content: '',
  reveal: null,
  anchorLink: null,
  review: null,
  createdAt: '2026-03-06T00:00:00.000Z',
  updatedAt: '2026-03-06T00:00:00.000Z'
};

function createSharedIndexNodes(countedContent: (value: string) => string): Record<string, Node> {
  return {
    'special-virtual-root': {
      ...baseNode,
      id: 'special-virtual-root',
      kind: 'folder',
      specialKind: 'virtual-root',
      title: 'Virtual'
    },
    'virtual-1': {
      ...baseNode,
      id: 'virtual-1',
      kind: 'folder',
      parentNodeId: 'special-virtual-root',
      specialKind: 'virtual',
      virtualFilter: createVirtualNodeFilterFromKeyword('alpha')
    },
    'virtual-2': {
      ...baseNode,
      id: 'virtual-2',
      kind: 'folder',
      parentNodeId: 'folder-1',
      specialKind: 'virtual',
      virtualFilter: createVirtualNodeFilterFromKeyword('beta')
    },
    'article-1': {
      ...baseNode,
      id: 'article-1',
      title: 'Alpha article',
      content: countedContent('alpha beta body')
    },
    'article-2': {
      ...baseNode,
      id: 'article-2',
      title: 'Beta article',
      content: countedContent('beta body')
    },
    'trashed-article': {
      ...baseNode,
      id: 'trashed-article',
      title: 'Alpha trashed',
      content: countedContent('alpha body')
    }
  };
}

it('builds a shared result index without preparing candidate text per virtual filter', () => {
  let preparedTextCount = 0;
  const countedContent = (value: string) => ({
    toString() {
      preparedTextCount += 1;
      return value;
    }
  }) as unknown as string;
  const nodesById = createSharedIndexNodes(countedContent);

  const index = buildVirtualNodeResultIndex({
    nodeOrder: ['special-virtual-root', 'virtual-1', 'virtual-2', 'article-1', 'article-2', 'trashed-article'],
    nodesById,
    trashedNodeIds: ['trashed-article']
  });

  expect(preparedTextCount).toBe(3);
  expect(index.resultIdsByVirtualId.get('virtual-1')).toEqual(['article-1', 'trashed-article']);
  expect(index.resultIdsByVirtualId.get('virtual-2')).toEqual(['article-1', 'article-2']);
  expect(index.rootResultIds).toEqual(['article-1']);
  expect(index.countById.get('virtual-1')).toBe(2);
  expect(index.countById.get('virtual-2')).toBe(2);
  expect(index.countById.get('special-virtual-root')).toBe(1);
});
