import { describe, expect, it } from 'vitest';

import { buildReadwiseUnlocatedNodeId } from '../../../../lib/core/readwise/readwiseOriginalEpubUnlocated';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  sortFolderListNodes
} from './folderListOrdering';
import type { Node } from './nodeTypes';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  const { id, title, ...rest } = overrides;
  return {
    content: '',
    createdAt: '2026-04-01T09:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-01T09:00:00.000Z',
    ...rest
  };
}

describe('folderListOrdering defaults', () => {
  it('defaults folder lists to saved time descending', () => {
    expect(DEFAULT_FOLDER_LIST_SORT_KEY).toBe('dateSaved');
    expect(DEFAULT_FOLDER_LIST_SORT_DIRECTION).toBe('desc');
  });

  it('sorts saved date independently from imported date', () => {
    const result = sortFolderListNodes(
      [
        createNode({
          createdAt: '2026-04-03T09:00:00.000Z',
          id: 'node-1',
          title: 'Imported later',
          updatedAt: '2026-04-04T09:00:00.000Z'
        }),
        createNode({
          createdAt: '2026-04-01T09:00:00.000Z',
          id: 'node-2',
          title: 'Saved later',
          updatedAt: '2026-04-05T09:00:00.000Z'
        })
      ],
      'dateSaved',
      'desc',
      {}
    );

    expect(result.map((node) => node.title)).toEqual(['Saved later', 'Imported later']);
  });

  it('sorts deleted topics by deletion time in both directions', () => {
    const nodes = [
      createNode({
        deletedAt: '2026-04-02T09:00:00.000Z',
        id: 'older',
        title: 'Older deleted'
      }),
      createNode({
        deletedAt: '2026-04-04T09:00:00.000Z',
        id: 'newer',
        title: 'Newer deleted'
      })
    ];

    expect(sortFolderListNodes(nodes, 'dateDeleted', 'desc', {}).map((node) => node.id)).toEqual(['newer', 'older']);
    expect(sortFolderListNodes(nodes, 'dateDeleted', 'asc', {}).map((node) => node.id)).toEqual(['older', 'newer']);
  });

  it('keeps only the dedicated Readwise unlocated role last in every ordering mode', () => {
    const dedicated = createNode({
      id: buildReadwiseUnlocatedNodeId('connection', 'document'), title: '※'
    });
    const ordinarySameTitle = createNode({ id: 'ordinary', title: '※' });
    const first = createNode({ id: 'first', title: 'A' });

    for (const sortKey of ['manual', 'name', 'dateSaved'] as const) {
      const result = sortFolderListNodes(
        [dedicated, ordinarySameTitle, first], sortKey, 'asc', {}, [dedicated.id, first.id, ordinarySameTitle.id]
      );
      expect(result.at(-1)?.id).toBe(dedicated.id);
      expect(result.findIndex((node) => node.id === ordinarySameTitle.id)).toBeLessThan(2);
    }
  });
});
