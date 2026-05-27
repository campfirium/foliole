import { expect, it } from 'vitest';

import type { ReadingState } from '../../lib/core/review/readingState';
import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  buildSequentialReadingDismissPatch,
  buildSequentialReadingSourcePatch
} from './workspaceSequentialReading';
import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';

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

function booksTree(overrides: Record<string, Partial<Node>> = {}) {
  const nodesById: Record<string, Node> = {
    [INBOX_NODE_ID]: node({ content: '', id: INBOX_NODE_ID, kind: 'folder', parentNodeId: null }),
    books: node({ content: '', id: 'books', kind: 'folder', parentNodeId: INBOX_NODE_ID, sequentialReadingEnabled: true }),
    debugging: node({ id: 'debugging', parentNodeId: 'books', reading: reading('dismissed'), title: 'Debugging' }),
    copyright: node({ id: 'copyright', parentNodeId: 'debugging', reading: reading('active'), title: 'Copyright' }),
    drucker: node({ id: 'drucker', parentNodeId: 'books', reading: reading('locked'), title: 'Drucker' })
  };
  for (const [nodeId, patch] of Object.entries(overrides)) {
    nodesById[nodeId] = { ...nodesById[nodeId]!, ...patch };
  }
  return {
    nodeOrder: [INBOX_NODE_ID, 'books', 'debugging', 'copyright', 'drucker'],
    nodesById
  };
}

function sourcePatch(overrides: Record<string, Partial<Node>> = {}) {
  const tree = booksTree({ books: { sequentialReadingEnabled: false }, ...overrides });
  return buildSequentialReadingSourcePatch({
    defaultPriority: 5,
    enabled: true,
    nodeOrder: tree.nodeOrder,
    nodesById: tree.nodesById,
    now: '2026-05-21T00:00:00.000Z',
    sourceNodeId: 'books'
  });
}

it('keeps the next book locked when the dismissed current book still has active or locked descendants', () => {
  expect(sourcePatch()?.nodesById.drucker?.reading?.state).toBe('locked');
  expect(sourcePatch({ copyright: { reading: reading('locked') } })?.nodesById.drucker?.reading?.state).toBe('locked');
});

it('releases the next book when the current book subtree has no reading capacity', () => {
  expect(sourcePatch({ copyright: { reading: reading('done') } })?.nodesById.drucker?.reading?.state).toBe('active');
  expect(sourcePatch({ copyright: { reading: reading('dismissed') } })?.nodesById.drucker?.reading?.state).toBe('active');
  expect(sourcePatch({ copyright: { shelvedAt: '2026-05-21T00:00:00.000Z' } })?.nodesById.drucker?.reading?.state).toBe('active');
});

it('does not release a sibling on dismiss when descendants still occupy the current book slot', () => {
  const tree = booksTree();
  const patch = buildSequentialReadingDismissPatch({
    defaultPriority: 5,
    dismissedNodeId: 'debugging',
    nodeOrder: tree.nodeOrder,
    nodesById: tree.nodesById,
    now: '2026-05-21T00:00:00.000Z'
  });

  expect(patch).toBeNull();
});

it('locks a later book during maintenance when a current-book descendant is added', () => {
  const previous = booksTree({ copyright: { reading: reading('dismissed') }, drucker: { reading: reading('active') } });
  const next = booksTree({ drucker: { reading: reading('active') } });
  const patch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: ['copyright'],
    defaultPriority: 5,
    nodeOrder: next.nodeOrder,
    nodesById: next.nodesById,
    now: '2026-05-21T00:00:00.000Z',
    previousNodesById: previous.nodesById
  });

  expect(patch?.nodesById.drucker?.reading?.state).toBe('locked');
});
