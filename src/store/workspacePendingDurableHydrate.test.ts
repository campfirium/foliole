import { beforeEach, describe, expect, it } from 'vitest';

import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { resetPendingDurableMutationsForTests, stagePendingNodeOrder, stagePendingRelearnNode } from '../shared/platform/workspacePendingDurableMutations';
import type { WorkspaceRuntimeSnapshot } from '../shared/platform/workspaceRuntimeTypes';

import { mergePendingDurableWorkspaceSnapshot } from './workspacePendingDurableHydrate';
import { mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';

function createSnapshot(): WorkspaceRuntimeSnapshot {
  return {
    activeNodeId: 'topic-2',
    nodeOrder: ['topic-1', 'topic-2'],
    nodesById: {
      'topic-1': { id: 'topic-1', parentNodeId: null, kind: 'topic', title: 'One', content: '', reveal: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      'topic-2': { id: 'topic-2', parentNodeId: null, kind: 'item', title: 'Two', content: '', reveal: '', review: { due: '2026-02-01T00:00:00.000Z', lastReviewAt: null, state: 0, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    },
    trashedNodeIds: []
  } as unknown as WorkspaceRuntimeSnapshot;
}

describe('pending durable hydrate merge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPendingDurableMutationsForTests();
  });

  it('reconciles order without losing eligible nodes and overlays pending relearn', () => {
    stagePendingNodeOrder(['topic-2', 'missing']);
    stagePendingRelearnNode('topic-2');

    const merged = mergePendingDurableWorkspaceSnapshot(createSnapshot());

    expect(merged.nodeOrder).toEqual(['topic-2', 'topic-1']);
    expect(merged.nodesById['topic-2']?.review).toBeNull();
  });

  it('preserves a pending node reading mutation through durable merge and normalization', () => {
    window.localStorage.setItem('foliole-pending-node-sync-v1', JSON.stringify({ nodesById: {
      'topic-2': {
        nodeId: 'topic-2', parentNodeId: null, kind: 'topic', title: 'Two', isTitleManual: false,
        content: '', reveal: null, anchorLink: null, reading: { state: 'dismissed' }, position: 1,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z'
      }
    } }));
    const source = createSnapshot();
    const pendingMerged = mergePendingNodeSyncIntoSnapshot(source)!;
    const durableMerged = mergePendingDurableWorkspaceSnapshot(pendingMerged);
    const normalized = normalizeWorkspaceSnapshot(durableMerged);

    expect(pendingMerged.nodesById['topic-2']?.reading).toEqual({ state: 'dismissed' });
    expect(durableMerged.nodesById['topic-2']?.reading).toEqual({ state: 'dismissed' });
    expect(normalized.nodesById['topic-2']?.reading).toEqual({ state: 'dismissed' });
  });

  it('does not alter legacy pending node merge output when no durable entry exists', () => {
    window.localStorage.setItem('foliole-pending-node-sync-v1', JSON.stringify({ nodesById: {
      'node-2': {
        nodeId: 'node-2', parentNodeId: null, priority: 0, desiredRetention: null,
        title: 'Node 2', isTitleManual: false, content: 'Node 2 content', reveal: null,
        anchorLink: null, reading: { state: 'dismissed' }, position: 1,
        createdAt: '2026-03-06T00:00:00.000Z', updatedAt: '2026-03-18T00:00:00.000Z'
      }
    } }));
    const source = {
      activeNodeId: 'node-2', nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reading: null, review: null, reveal: null },
        'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reading: null, review: null, reveal: null }
      },
      trashedNodeIds: []
    } as unknown as WorkspaceRuntimeSnapshot;

    const pendingMerged = mergePendingNodeSyncIntoSnapshot(source)!;
    const durableMerged = mergePendingDurableWorkspaceSnapshot(pendingMerged);

    expect(pendingMerged.nodesById['node-2']?.reading).toEqual({ state: 'dismissed' });
    expect(durableMerged.nodesById['node-2']?.reading).toEqual({ state: 'dismissed' });
  });
});
