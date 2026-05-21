import { expect, it } from 'vitest';

import type { ReadingState } from '../../lib/core/review/readingState';
import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  buildSequentialReadingDismissPatch,
  buildSequentialReadingSourcePatch,
  isSequentialReadingSourceTopic
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

function sourceTree(overrides: Record<string, Partial<Node>> = {}) {
  const nodesById: Record<string, Node> = {
    [INBOX_NODE_ID]: node({ content: '', id: INBOX_NODE_ID, kind: 'folder', parentNodeId: null }),
    source: node({ id: 'source', parentNodeId: INBOX_NODE_ID, sequentialReadingEnabled: false }),
    first: node({ id: 'first', parentNodeId: 'source', reading: reading('active') }),
    folder: node({ content: '', id: 'folder', kind: 'folder', parentNodeId: 'source' }),
    nested: node({ id: 'nested', parentNodeId: 'folder', reading: reading('active') }),
    last: node({ id: 'last', parentNodeId: 'source', reading: reading('active') })
  };
  for (const [nodeId, patch] of Object.entries(overrides)) {
    nodesById[nodeId] = { ...nodesById[nodeId]!, ...patch };
  }
  return {
    nodeOrder: [INBOX_NODE_ID, 'source', 'first', 'folder', 'nested', 'last'],
    nodesById
  };
}

it('enables source topics by releasing one derived topic and locking later tree-order topics', () => {
  const tree = sourceTree({ nested: { reading: reading('done') } });
  const patch = buildSequentialReadingSourcePatch({
    defaultPriority: 5,
    enabled: true,
    nodeOrder: tree.nodeOrder,
    nodesById: tree.nodesById,
    now: '2026-05-21T00:00:00.000Z',
    sourceNodeId: 'source'
  });

  expect(patch?.nodesById.source?.sequentialReadingEnabled).toBe(true);
  expect(patch?.nodesById.first?.reading?.state).toBe('active');
  expect(patch?.nodesById.nested?.reading?.state).toBe('done');
  expect(patch?.nodesById.last?.reading?.state).toBe('locked');
});

it('disables source topics by returning locked derived topics to active', () => {
  const tree = sourceTree({ last: { reading: reading('locked') }, source: { sequentialReadingEnabled: true } });
  const patch = buildSequentialReadingSourcePatch({
    defaultPriority: 5,
    enabled: false,
    nodeOrder: tree.nodeOrder,
    nodesById: tree.nodesById,
    now: '2026-05-21T00:00:00.000Z',
    sourceNodeId: 'source'
  });

  expect(patch?.nodesById.source?.sequentialReadingEnabled).toBe(false);
  expect(patch?.nodesById.last?.reading?.state).toBe('active');
});

it('dismiss unlocks the next locked derived topic without changing dismissed or done topics', () => {
  const tree = sourceTree({
    first: { reading: reading('dismissed') },
    nested: { reading: reading('done') },
    last: { reading: reading('locked') },
    source: { sequentialReadingEnabled: true }
  });
  const patch = buildSequentialReadingDismissPatch({
    defaultPriority: 5,
    dismissedNodeId: 'first',
    nodeOrder: tree.nodeOrder,
    nodesById: tree.nodesById,
    now: '2026-05-21T00:00:00.000Z'
  });

  expect(patch?.nodesById.nested?.reading?.state).toBe('done');
  expect(patch?.nodesById.last?.reading?.state).toBe('active');
});

it('keeps a new later derived topic locked but releases it when no active derived topic remains', () => {
  const activeTree = sourceTree({ source: { sequentialReadingEnabled: true } });
  const activePatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: ['last'],
    defaultPriority: 5,
    nodeOrder: activeTree.nodeOrder,
    nodesById: activeTree.nodesById,
    now: '2026-05-21T00:00:00.000Z'
  });
  expect(activePatch?.nodesById.last?.reading?.state).toBe('locked');

  const doneTree = sourceTree({
    first: { reading: reading('dismissed') },
    nested: { reading: reading('done') },
    last: { reading: null },
    source: { sequentialReadingEnabled: true }
  });
  const donePatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: ['last'],
    defaultPriority: 5,
    nodeOrder: doneTree.nodeOrder,
    nodesById: doneTree.nodesById,
    now: '2026-05-21T00:00:00.000Z'
  });
  expect(donePatch?.nodesById.last?.reading?.state).toBe('active');
});

it('does not treat derived topics as source topics and unlocks moved-out topics', () => {
  const previous = sourceTree({ last: { reading: reading('locked') }, source: { sequentialReadingEnabled: true } });
  const nextNodesById = {
    ...previous.nodesById,
    last: { ...previous.nodesById.last!, parentNodeId: INBOX_NODE_ID }
  };
  const patch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: ['last'],
    defaultPriority: 5,
    nodeOrder: previous.nodeOrder,
    nodesById: nextNodesById,
    now: '2026-05-21T00:00:00.000Z',
    previousNodesById: previous.nodesById
  });

  expect(isSequentialReadingSourceTopic(previous.nodesById.first, previous.nodesById)).toBe(false);
  expect(patch?.nodesById.last?.reading?.state).toBe('active');
});
