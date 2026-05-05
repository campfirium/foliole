import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  createVirtualNodeFilterFromKeyword,
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
