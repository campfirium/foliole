import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';

import { dismissCompanionReviewTopic } from './companionReadingReviewSessionActions';

function reading(state: 'active' | 'dismissed' | 'done' | 'locked' = 'active') {
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

function node(args: Partial<WorkspaceNodeSnapshot> & Pick<WorkspaceNodeSnapshot, 'id' | 'parentNodeId'>): WorkspaceNodeSnapshot {
  const { id, parentNodeId, ...overrides } = args;

  return {
    anchorLink: null,
    content: '# Topic',
    createdAt: '2026-05-01T00:00:00.000Z',
    hideTitleHeading: false,
    id,
    isTitleManual: false,
    kind: 'topic',
    parentNodeId,
    reading: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides
  };
}

function sequentialSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'first',
    nodeOrder: ['inbox', 'source', 'first', 'last'],
    nodesById: {
      first: node({ id: 'first', parentNodeId: 'source', reading: reading('active') }),
      inbox: node({ content: '', id: 'inbox', kind: 'folder', parentNodeId: null }),
      last: node({ id: 'last', parentNodeId: 'source', reading: reading('locked') }),
      source: node({ id: 'source', parentNodeId: 'inbox', sequentialReadingEnabled: true })
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

it('dismisses companion reading topics through the shared sequential reading patch', () => {
  const result = dismissCompanionReviewTopic({
    nodeId: 'first',
    now: '2026-05-21T00:00:00.000Z',
    snapshot: sequentialSnapshot()
  });

  expect(result?.snapshot.nodesById.first?.reading?.state).toBe('dismissed');
  expect(result?.snapshot.nodesById.last?.reading?.state).toBe('active');
  expect(result?.syncNodeIds).toEqual(['first', 'last']);
});
