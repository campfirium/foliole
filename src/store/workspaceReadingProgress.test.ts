import { expect, it } from 'vitest';

import { mergeWorkspaceSnapshotWithReadingProgress, toRuntimeNodeViewStates } from './workspaceReadingProgress';

it('keeps scroll-only reading progress selection null during hydrate', () => {
  const snapshot = {
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: { 'node-1': {} },
    trashedNodeIds: []
  };

  expect(
    mergeWorkspaceSnapshotWithReadingProgress(snapshot, {
      activeNodeId: 'node-1',
      browseRootNodeId: 'folder-a',
      nodeViewStateById: {
        'node-1': {
          scrollTop: 1800,
          selectionFrom: null,
          selectionTo: null
        }
      }
    })
  ).toMatchObject({
    activeNodeId: 'node-1',
    browseRootNodeId: 'folder-a',
    nodeViewById: {
      'node-1': {
        scrollTop: 1800,
        selection: null,
        updatedAt: null
      }
    }
  });
});

it('carries per-node updated time when saving runtime node view states', () => {
  expect(
    toRuntimeNodeViewStates({
      'node-1': {
        scrollTop: 1800,
        selection: null,
        updatedAt: '2026-04-30T08:00:00.000Z'
      },
      'node-2': {
        scrollTop: 20,
        selection: { from: 2, to: 6 },
        updatedAt: '2026-04-30T09:00:00.000Z'
      }
    })
  ).toEqual([
    {
      nodeId: 'node-1',
      scrollTop: 1800,
      selectionFrom: null,
      selectionTo: null,
      updatedAt: '2026-04-30T08:00:00.000Z'
    },
    {
      nodeId: 'node-2',
      scrollTop: 20,
      selectionFrom: 2,
      selectionTo: 6,
      updatedAt: '2026-04-30T09:00:00.000Z'
    }
  ]);
});
