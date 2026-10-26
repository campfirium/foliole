import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { advanceFlowSession, flowState } from './workspaceFlowSession';
import { createEmptyReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { advanceAfterSoonAction } from './workspaceStoreReadingReviewSessionFlow';

const now = '2026-10-25T08:00:00.000Z';
type Node = WorkspaceSnapshot['nodesById'][string];
function node(id: string, overrides: Partial<Node> = {}): Node {
  return { id, parentNodeId: null, kind: 'topic', title: id, content: 'Body', reveal: null,
    anchorLink: null, isTitleManual: false, hideTitleHeading: false,
    review: null, reading: null, createdAt: now, updatedAt: now, ...overrides };
}
function snapshot(): WorkspaceSnapshot {
  return { activeNodeId: 'a', nodeOrder: ['a', 'b', 'other'],
    nodesById: { a: node('a'), b: node('b'), other: node('other') },
    trashedNodeIds: [], untitledSequenceByParent: {} };
}
function session() {
  return { ...createEmptyReviewSession(), currentNodeId: 'a', queueNodeIds: ['a', 'b'],
    soonNodeIds: ['s'], totalNodeCount: 3, sessionStartedAt: now, stepStartedAt: now };
}

it('advances Soon without reading unrelated library lifecycle facts', () => {
  const source = snapshot();
  let unrelated = 0;
  Object.defineProperty(source.nodesById.other, 'deletedAt', { get: () => { unrelated += 1; return null; } });
  const next = advanceFlowSession({ action: 'soon', snapshot: source, session: session(), mode: 'recommended', now });
  expect(next).toMatchObject({ currentNodeId: 'b', queueNodeIds: ['b'], soonNodeIds: ['s', 'a'] });
  expect(unrelated).toBe(0);
});

it.each(['plain', 'deleted', 'legacy', 'restored', 'blank', 'invalid', 'missing'] as const)(
  'preserves normalized Soon progression for %s queue facts', state => {
    const source = snapshot();
    if (state === 'deleted') source.nodesById.b!.deletedAt = now;
    if (state === 'legacy' || state === 'restored') source.trashedNodeIds = ['b'];
    if (state === 'restored') source.nodesById.b!.deletedAt = null;
    if (state === 'blank') source.trashedNodeDeletedAtById = { b: ' ' };
    if (state === 'invalid') source.nodesById.b!.id = 'wrong';
    if (state === 'missing') delete source.nodesById.b;
    const current = session();
    const normalized = flowState(source, current, 'recommended');
    const expected = advanceAfterSoonAction({ currentNodeId: 'a', now,
      state: normalized, snapshot: normalized, progressDelta: 1,
      readingElapsedMsDelta: calculateReviewStepElapsedMs(current, now) });
    expect(advanceFlowSession({ action: 'soon', snapshot: source, session: current,
      mode: 'recommended', now })).toEqual(expected);
  });
