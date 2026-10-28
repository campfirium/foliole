import { expect, it } from 'vitest';

import { resolveWorkspaceTopicTreeRowModel } from '../../../app/components/workspaceTopicTreeRowModel';
import { patchWorkspaceRecord } from '../../../shared/workspaceRecordPatch';
import { mergeDailyFlowReceiptNodes } from '../../../store/workspaceDailyFlowReceipt';
import { canDismissNode, canPostponeTopic } from '../components/nodeListContextMenuReview';

import type { Node, NodeReadingProfile, NodeReviewProfile } from './nodeTypes';
import { getWorkspaceListReviewItemKind, isInactiveWorkspaceListReadingTopic, projectWorkspaceListNodesById } from './workspaceListNode';

const reading: NodeReadingProfile = {
  intervalDurationMs: 1000, intervalGrowthFactor: 2, lastHandledAt: '2026-10-27',
  nextAt: '2026-10-29', priority: 5, readingPosition: 10, repetitionCount: 1, state: 'active'
};
const review: NodeReviewProfile = {
  due: '2026-10-29', lastReviewAt: null, state: 0, stability: 1,
  difficulty: 2, elapsedDays: 3, scheduledDays: 4, reps: 0, lapses: 0
};
function node(id: string): Node {
  return { id, kind: 'topic', content: 'Body', reveal: null, parentNodeId: null, title: id,
    createdAt: '2026-10-28', updatedAt: '2026-10-28', reading, review };
}
const readingChanges: Partial<NodeReadingProfile>[] = [
  { intervalDurationMs: 2000 }, { intervalGrowthFactor: 3 }, { lastHandledAt: '2026-10-28' },
  { nextAt: '2026-10-30' }, { priority: 6 }, { readingPosition: 20 }
];
const reviewChanges: Partial<NodeReviewProfile>[] = [
  { due: '2026-10-30' }, { state: 1 }, { stability: 2 }, { difficulty: 3 },
  { elapsedDays: 4 }, { scheduledDays: 5 }, { reps: 1 }, { lapses: 1 }
];

for (const localPatch of [false, true]) {
  const update = (source: Record<string, Node>, changed: Node) => localPatch
    ? patchWorkspaceRecord(source, { target: changed }) : { ...source, target: changed };
  it.each([...readingChanges.map(change => ({ reading: { ...reading, ...change } })),
    ...reviewChanges.map(change => ({ review: { ...review, ...change } }))])(
    `keeps list results for non-display learning changes (patch=${localPatch}): %j`, change => {
      const source = { target: node('target'), other: node('other') };
      const first = projectWorkspaceListNodesById(source);
      const changed = { ...source.target, ...change };
      const next = projectWorkspaceListNodesById(update(source, changed), first);
      expect(next).toBe(first);
      expect(source.target.reading).toEqual(reading);
      expect(changed).toMatchObject(change);
    }
  );
  it.each([
    { reading: { ...reading, state: 'dismissed' as const } },
    { reading: { ...reading, repetitionCount: 2 } },
    { reading: null }, { review: { ...review, lastReviewAt: '2026-10-28' } }, { review: null }
  ])(`refreshes real list learning changes (patch=${localPatch}): %j`, change => {
    const source = { target: node('target'), other: node('other') };
    const first = projectWorkspaceListNodesById(source);
    const next = projectWorkspaceListNodesById(update(source, { ...source.target, ...change }), first);
    expect(next).not.toBe(first);
    expect(next.other).toBe(first.other);
    if ('reading' in change) expect(next.target?.reading).toEqual(change.reading
      ? { state: change.reading.state, repetitionCount: change.reading.repetitionCount } : null);
    if ('review' in change) expect(next.target?.review).toEqual(change.review
      ? { lastReviewAt: change.review.lastReviewAt } : null);
  });
}

it('keeps classification, inactive state and full source facts distinct from list summaries', () => {
  const source = { target: { ...node('target'), kind: 'topic' as const,
    reading: { ...reading, state: 'dismissed' as const } }, legacy: { ...node('legacy'), kind: undefined as unknown as Node['kind'] } };
  const projected = projectWorkspaceListNodesById(source);
  expect(isInactiveWorkspaceListReadingTopic(projected.target)).toBe(true);
  expect(getWorkspaceListReviewItemKind(projected.legacy)).toBe('fsrs');
  expect(projected.target?.reading).toEqual({ state: 'dismissed', repetitionCount: 1 });
  expect(projected.legacy?.review).toEqual({ lastReviewAt: null });
  expect(source.target.reading).toEqual({ ...reading, state: 'dismissed' });
  expect(source.legacy.review).toEqual(review);
});

it('updates row icons and reading menus through successive learning summaries', () => {
  const original = { ...node('target'), kind: 'topic' as const, review: null,
    reading: { ...reading, repetitionCount: 0 } };
  let source = { target: original };
  let projected = projectWorkspaceListNodesById(source);
  const display = () => {
    const target = projected.target!;
    return resolveWorkspaceTopicTreeRowModel(
      { node: target, depth: 0, descendantCount: 0, hasChildren: false },
      { nodesById: projected, collapsedNodeIds: new Set(), selectedNodeIds: [] }
    );
  };
  expect(display().nodeIconState).toBe('pending');
  expect(canDismissNode(projected.target)).toBe(true);
  source = { target: { ...original, reading: { ...reading, repetitionCount: 1 } } };
  projected = projectWorkspaceListNodesById(source, projected);
  expect(display().nodeIconState).toBe('scheduled');
  source = { target: { ...source.target, reading: { ...reading, state: 'dismissed' } } };
  projected = projectWorkspaceListNodesById(source, projected);
  expect(display().nodeIconState).toBe('dismissed');
  expect(canDismissNode(projected.target)).toBe(false);
  expect(canPostponeTopic(projected.target)).toBe(false);
  const item = { target: { ...node('target'), kind: 'item' as const, review } };
  projected = projectWorkspaceListNodesById(item, projected);
  expect(display().nodeIconState).toBe('pending');
  projected = projectWorkspaceListNodesById({ target: { ...item.target,
    review: { ...review, lastReviewAt: '2026-10-28' } } }, projected);
  expect(display().nodeIconState).toBe('scheduled');
});

it('merges full learning receipts without invalidating unchanged list display', () => {
  const source = { target: node('target') };
  const projected = projectWorkspaceListNodesById(source);
  const fullReading = { ...reading, intervalDurationMs: 4000 };
  const fullReview = { ...review, stability: 8 };
  const next = mergeDailyFlowReceiptNodes(source, source, undefined,
    { target: { reading: fullReading, review: fullReview } });
  expect(next.target!.reading).toEqual(fullReading);
  expect(next.target!.review).toEqual(fullReview);
  expect(projectWorkspaceListNodesById(next, projected)).toBe(projected);
});
