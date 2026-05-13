import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import { buildNodeSearchResults } from './workspaceNodeSearch';

function createNode(
  input: Partial<WorkspaceListNode> & Pick<WorkspaceListNode, 'id' | 'title'>
): WorkspaceListNode {
  return {
    id: input.id,
    parentNodeId: input.parentNodeId ?? null,
    title: input.title,
    hasContent: input.hasContent ?? true,
    hasReveal: input.hasReveal ?? false,
    anchorLink: input.anchorLink ?? null,
    reading: input.reading ?? null,
    review: null,
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
    ...definedProps({ specialKind: input.specialKind })
  };
}

it('shows default node results even when the query is empty', () => {
  const results = buildNodeSearchResults(
    [INBOX_NODE_ID, 'node-1'],
    {
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', hasContent: false, specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas' })
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
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', hasContent: false, specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas' }),
      'node-2': createNode({ id: 'node-2', title: 'Zebra' })
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
      [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, title: 'Inbox', hasContent: false, specialKind: 'inbox' }),
      'node-1': createNode({ id: 'node-1', title: 'Atlas' }),
      'node-2': createNode({ id: 'node-2', title: 'Idea' })
    },
    [],
    [],
    'i'
  );

  expect(results[0]?.id).toBe(INBOX_NODE_ID);
});
