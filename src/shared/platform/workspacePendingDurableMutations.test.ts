import { beforeEach, describe, expect, it } from 'vitest';

import {
  mergePendingReadingProgress,
  readPendingNodeOrder,
  readPendingReadingProgress,
  readPendingRelearnNodes,
  resetPendingDurableMutationsForTests,
  resolvePendingNodeOrder,
  resolvePendingReadingProgress,
  resolvePendingRelearnNode,
  stagePendingNodeOrder,
  stagePendingReadingProgress,
  stagePendingRelearnNode
} from './workspacePendingDurableMutations';

const readingPayload = {
  activeNodeId: 'topic-1',
  browseRootNodeId: 'special-home',
  nodeViewStates: [{ nodeId: 'topic-1', scrollTop: 42, selectionFrom: null, selectionTo: null }],
  source: 'user-scroll' as const,
  updatedAt: '2026-07-10T10:00:00.000Z'
};

describe('pending durable discrete mutations', () => {
  beforeEach(resetPendingDurableMutationsForTests);

  it('keeps only the latest order and ignores a stale acknowledgement', () => {
    const first = stagePendingNodeOrder(['a', 'b'])!;
    const second = stagePendingNodeOrder(['b', 'a'])!;

    expect(resolvePendingNodeOrder(first)).toBe(false);
    expect(readPendingNodeOrder()?.payload).toEqual(['b', 'a']);
    expect(resolvePendingNodeOrder(second)).toBe(true);
    expect(readPendingNodeOrder()).toBeNull();
  });

  it('keeps revisions monotonic after the journal becomes empty', () => {
    const first = stagePendingNodeOrder(['a', 'b'])!;
    resolvePendingNodeOrder(first);
    const later = stagePendingNodeOrder(['a', 'b'])!;

    expect(later.revision).toBeGreaterThan(first.revision);
    expect(resolvePendingNodeOrder(first)).toBe(false);
    expect(readPendingNodeOrder()).not.toBeNull();
  });

  it('deduplicates relearn by node id without letting an old ack clear a new entry', () => {
    const first = stagePendingRelearnNode('item-1')!;
    const second = stagePendingRelearnNode('item-1')!;
    stagePendingRelearnNode('item-2');

    expect(readPendingRelearnNodes().map((entry) => entry.payload.nodeId)).toEqual(['item-1', 'item-2']);
    expect(resolvePendingRelearnNode('item-1', first)).toBe(false);
    expect(resolvePendingRelearnNode('item-1', second)).toBe(true);
  });
});

describe('pending durable reading mutations', () => {
  beforeEach(resetPendingDurableMutationsForTests);

  it('keeps one latest reading payload and merges it over runtime state', () => {
    const first = stagePendingReadingProgress(readingPayload)!;
    const latestPayload = { ...readingPayload, updatedAt: '2026-07-10T10:01:00.000Z', nodeViewStates: [
      { nodeId: 'topic-1', scrollTop: 84, selectionFrom: 4, selectionTo: 8 }
    ] };
    const second = stagePendingReadingProgress(latestPayload)!;

    expect(resolvePendingReadingProgress(first)).toBe(false);
    expect(mergePendingReadingProgress(null)).toEqual({
      activeNodeId: 'topic-1',
      browseRootNodeId: 'special-home',
      nodeViewStateById: {
        'topic-1': { scrollTop: 84, selectionFrom: 4, selectionTo: 8, updatedAt: latestPayload.updatedAt }
      }
    });
    expect(resolvePendingReadingProgress(second)).toBe(true);
    expect(readPendingReadingProgress()).toBeNull();
  });

  it('does not let older pending reading state overwrite newer runtime state', () => {
    stagePendingReadingProgress(readingPayload);

    expect(mergePendingReadingProgress({
      activeNodeId: 'topic-1',
      nodeViewStateById: {
        'topic-1': { scrollTop: 99, selectionFrom: null, selectionTo: null, updatedAt: '2026-07-10T11:00:00.000Z' }
      }
    })?.nodeViewStateById['topic-1']?.scrollTop).toBe(99);
  });

  it('keeps the runtime browse root when replaying a legacy pending payload', () => {
    stagePendingReadingProgress({
      activeNodeId: 'topic-1',
      nodeViewStates: [],
      updatedAt: '2026-07-10T10:00:00.000Z'
    });

    expect(mergePendingReadingProgress({
      activeNodeId: 'topic-2',
      browseRootNodeId: 'folder-a',
      nodeViewStateById: {}
    })?.browseRootNodeId).toBe('folder-a');
  });

  it('ignores malformed fixed-field payloads during hydrate', () => {
    window.localStorage.setItem('foliole-pending-durable-mutations-v1', JSON.stringify({
      nextRevision: 2,
      nodeOrder: { revision: 1, signature: 'bad', payload: [42] },
      readingProgress: { revision: 1, signature: 'bad', payload: { nodeViewStates: 'bad' } },
      relearnByNodeId: { bad: { revision: 1, signature: 'bad', payload: { nodeId: 42 } } }
    }));

    expect(readPendingNodeOrder()).toBeNull();
    expect(readPendingReadingProgress()).toBeNull();
    expect(readPendingRelearnNodes()).toEqual([]);
  });
});
