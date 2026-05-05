import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';

import { buildNodeSearchResults } from './workspaceNodeSearch';

function createNode(input: Partial<Node> & Pick<Node, 'id' | 'title' | 'content'>): Node {
  return {
    id: input.id,
    parentNodeId: input.parentNodeId ?? null,
    title: input.title,
    content: input.content,
    specialKind: input.specialKind,
    anchorLink: input.anchorLink ?? null,
    reveal: null,
    review: null,
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z'
  };
}

it('shows default node results even when the query is empty', () => {
  const results = buildNodeSearchResults(
    [INBOX_NODE_ID, 'node-1'],
    {
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', content: '', specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas', content: 'content' })
    },
    [],
    [],
    ''
  );

  expect(results.map((item) => item.id)).toEqual([INBOX_NODE_ID, 'node-1']);
});

it('prioritizes recently used nodes over the default order', () => {
  const results = buildNodeSearchResults(
    [INBOX_NODE_ID, 'node-1', 'node-2'],
    {
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', content: '', specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas', content: 'content' }),
      'node-2': createNode({ id: 'node-2', title: 'Zebra', content: 'content' })
    },
    ['node-2'],
    [],
    ''
  );

  expect(results[0]?.id).toBe('node-2');
});

it('matches special keywords and keeps inbox near the top for short input', () => {
  const results = buildNodeSearchResults(
    ['node-1', INBOX_NODE_ID, 'node-2'],
    {
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', content: '', specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas', content: 'content' }),
      'node-2': createNode({ id: 'node-2', title: 'Idea', content: 'content' })
    },
    [],
    [],
    'i'
  );

  expect(results[0]?.id).toBe(INBOX_NODE_ID);
});
