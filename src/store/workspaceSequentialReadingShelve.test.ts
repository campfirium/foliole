import { expect, it } from 'vitest';

import type { ReadingState } from '../../lib/core/review/readingState';
import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { buildSequentialReadingSourcePatch } from './workspaceSequentialReading';

function reading(state: ReadingState = 'active') {
  return {
    intervalDurationMs: 1000,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-05-01T00:00:00.000Z',
    nextAt: '2026-05-02T00:00:00.000Z',
    priority: 5,
    readingPosition: 0,
    repetitionCount: 0,
    state
  };
}

function node(args: Partial<Node> & Pick<Node, 'id' | 'parentNodeId'>): Node {
  return {
    content: '# Topic',
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: true,
    hideTitleHeading: false,
    kind: 'topic',
    reading: null,
    reveal: null,
    review: null,
    title: args.id,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...args,
    id: args.id,
    parentNodeId: args.parentNodeId
  };
}

it('shelved derived topics do not occupy the released sequential reading slot', () => {
  const nodesById: Record<string, Node> = {
    [INBOX_NODE_ID]: node({ content: '', id: INBOX_NODE_ID, kind: 'folder', parentNodeId: null }),
    source: node({ id: 'source', parentNodeId: INBOX_NODE_ID, sequentialReadingEnabled: true }),
    first: node({
      id: 'first',
      parentNodeId: 'source',
      reading: reading('active'),
      shelvedAt: '2026-05-20T00:00:00.000Z'
    }),
    nested: node({ id: 'nested', parentNodeId: 'source', reading: reading('done') }),
    last: node({ id: 'last', parentNodeId: 'source', reading: reading('locked') })
  };
  const patch = buildSequentialReadingSourcePatch({
    defaultPriority: 5,
    enabled: true,
    nodeOrder: [INBOX_NODE_ID, 'source', 'first', 'nested', 'last'],
    nodesById,
    now: '2026-05-21T00:00:00.000Z',
    sourceNodeId: 'source'
  });

  expect(patch?.nodesById.first?.reading?.state).toBe('active');
  expect(patch?.nodesById.last?.reading?.state).toBe('active');
});
