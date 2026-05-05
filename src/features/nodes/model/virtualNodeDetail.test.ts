import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  createVirtualNodeFilterFromKeyword,
  getOrderedVirtualNodeResultNodes,
  getVirtualRootResultNodes,
  getVirtualNodeResultReferences,
  resolveVirtualNodeResultNodes
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

it('returns original article references for first-pass text matching', () => {
    const references = getVirtualNodeResultReferences(
      'virtual-1',
      {
        'virtual-1': {
          ...baseNode,
          id: 'virtual-1',
          kind: 'folder',
          specialKind: 'virtual'
        },
        'article-1': {
          ...baseNode,
          id: 'article-1',
          title: 'Reader article',
          content: 'Reader body'
        },
        'highlight-1': {
          ...baseNode,
          id: 'highlight-1',
          title: 'Reader highlight',
          content: 'Reader body',
          anchorLink: { id: 'a1', kind: 'highlight' }
        }
      },
      createVirtualNodeFilterFromKeyword('reader')
    );

    expect(references).toEqual([{ sourceNodeId: 'article-1' }]);
});

it('recomputes result references after source data changes', () => {
    const filter = createVirtualNodeFilterFromKeyword('reader');
    const before = getVirtualNodeResultReferences(
      'virtual-1',
      {
        'virtual-1': { ...baseNode, id: 'virtual-1', kind: 'folder', specialKind: 'virtual' },
        'article-1': { ...baseNode, id: 'article-1', title: 'Reader article', content: 'Body' }
      },
      filter
    );
    const after = getVirtualNodeResultReferences(
      'virtual-1',
      {
        'virtual-1': { ...baseNode, id: 'virtual-1', kind: 'folder', specialKind: 'virtual' },
        'article-1': { ...baseNode, id: 'article-1', title: 'Renamed article', content: 'Body' }
      },
      filter
    );

    expect(before).toEqual([{ sourceNodeId: 'article-1' }]);
    expect(after).toEqual([]);
});

it('returns empty results for empty conditions and no matches', () => {
    expect(
      getVirtualNodeResultReferences(
        'virtual-1',
        { 'virtual-1': { ...baseNode, id: 'virtual-1', kind: 'folder', specialKind: 'virtual' } },
        createVirtualNodeFilterFromKeyword('')
      )
    ).toEqual([]);

    expect(
      getVirtualNodeResultReferences(
        'virtual-1',
        {
          'virtual-1': { ...baseNode, id: 'virtual-1', kind: 'folder', specialKind: 'virtual' },
          'article-1': { ...baseNode, id: 'article-1', title: 'Other', content: 'Nothing here' }
        },
        createVirtualNodeFilterFromKeyword('reader')
      )
    ).toEqual([]);
});

it('ignores stale references when resolving result nodes', () => {
    expect(
      resolveVirtualNodeResultNodes(
        [{ sourceNodeId: 'missing-1' }, { sourceNodeId: 'article-1' }],
        {
          'article-1': { ...baseNode, id: 'article-1', title: 'Reader article', content: 'Reader body' }
        }
      )
    ).toEqual([{ ...baseNode, id: 'article-1', title: 'Reader article', content: 'Reader body' }]);
});

it('preserves workspace order when returning virtual node result nodes', () => {
  expect(
    getOrderedVirtualNodeResultNodes(
      'virtual-1',
      ['article-2', 'virtual-1', 'article-1'],
      {
        'virtual-1': {
          ...baseNode,
          id: 'virtual-1',
          kind: 'folder',
          specialKind: 'virtual'
        },
        'article-1': {
          ...baseNode,
          id: 'article-1',
          title: 'Reader later',
          content: 'reader'
        },
        'article-2': {
          ...baseNode,
          id: 'article-2',
          title: 'Reader first',
          content: 'reader'
        }
      },
      createVirtualNodeFilterFromKeyword('reader')
    ).map((node) => node.id)
  ).toEqual(['article-2', 'article-1']);
});

it('returns the combined results for the Virtual root', () => {
  expect(
    getVirtualRootResultNodes(
      ['special-virtual-root', 'virtual-1', 'virtual-2', 'article-1', 'article-2'],
      {
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
          parentNodeId: 'special-virtual-root',
          specialKind: 'virtual',
          virtualFilter: createVirtualNodeFilterFromKeyword('beta')
        },
        'article-1': {
          ...baseNode,
          id: 'article-1',
          title: 'Alpha article',
          content: 'alpha body'
        },
        'article-2': {
          ...baseNode,
          id: 'article-2',
          title: 'Beta article',
          content: 'beta body'
        }
      }
    ).map((node) => node.id)
  ).toEqual(['article-1', 'article-2']);
});
