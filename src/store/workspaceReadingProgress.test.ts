import { describe, expect, it } from 'vitest';

import { mergeWorkspaceSnapshotWithReadingProgress } from './workspaceReadingProgress';

describe('workspaceReadingProgress', () => {
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
      nodeViewById: {
        'node-1': {
          scrollTop: 1800,
          selection: null,
          updatedAt: null
        }
      }
    });
  });
});
