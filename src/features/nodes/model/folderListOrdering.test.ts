import { describe, expect, it } from 'vitest';

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
  it('defaults folder lists to last opened time descending', () => {
    expect(DEFAULT_FOLDER_LIST_SORT_KEY).toBe('dateLastOpened');
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
});
