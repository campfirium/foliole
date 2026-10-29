// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceListNode } from '../features/nodes/model/workspaceListNode';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { mergeHydratedNode } from './workspaceHydrateObjectMerge';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: '2026-10-01T00:00:00.000Z',
  nextAt: '2026-11-01T00:00:00.000Z', priority: 3, readingPosition: 2, repetitionCount: 9, state: 'active' as const };
const review = { due: reading.nextAt, lastReviewAt: reading.lastHandledAt, state: 2 as const,
  stability: 7, difficulty: 4, elapsedDays: 2, scheduledDays: 20, reps: 9, lapses: 1 };

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(() => new Promise(() => undefined)));
  useWorkspaceStore.setState({ ...createInitialWorkspaceState(new Date('2026-10-30T00:00:00.000Z')),
    activeNodeId: 'node-1', nodeOrder: ['node-1'], nodesById: { 'node-1': { id: 'node-1', kind: 'topic',
      title: 'Topic', parentNodeId: null, content: 'Body', reveal: null, review: null,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' } } });
});

it('keeps complete facts out of active and inactive native directory nodes, including later receipts', () => {
  const seed = useWorkspaceStore.getState().nodesById['node-1']!;
  useWorkspaceStore.setState({ activeNodeId: 'node-1', nodeOrder: ['node-1', 'node-2'],
    nodesById: { 'node-1': { ...seed, reading, review }, 'node-2': { ...seed, id: 'node-2', reading, review } } });
  for (const node of Object.values(useWorkspaceStore.getState().nodesById).filter(node => !node.specialKind)) {
    expect(node).not.toHaveProperty('reading');
    expect(node).not.toHaveProperty('review');
    expect(node.learningSummary).toEqual({ reading: { state: 'active', repetitionCount: 9 }, review: { lastReviewAt: review.lastReviewAt } });
    expect(toWorkspaceListNode(node).reading?.repetitionCount).toBe(9);
  }
  const before = useWorkspaceStore.getState().nodesById;
  const merged = mergeDailyFlowReceiptNodes(before, before, undefined, { 'node-1': { reading: null, review: null } });
  useWorkspaceStore.setState({ nodesById: merged });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.learningSummary).toEqual({ reading: null, review: null });
  expect(useWorkspaceStore.getState().nodesById['node-2']?.learningSummary?.reading?.repetitionCount).toBe(9);
});

it('takes refreshed learning summaries even when an unsaved body has a later timestamp', () => {
  const seed = useWorkspaceStore.getState().nodesById['node-1']!;
  const current = { ...seed, content: 'Local edit', updatedAt: '2026-10-30T00:00:00.000Z',
    learningSummary: { reading: { state: 'active' as const, repetitionCount: 9 }, review: null } };
  const next = { ...seed, content: '', updatedAt: '2026-10-01T00:00:00.000Z', learningSummary: { reading: null, review: null } };
  const merged = mergeHydratedNode(current, next);
  expect(merged.content).toBe('Local edit');
  expect(merged.learningSummary).toEqual(next.learningSummary);
  expect(merged).not.toHaveProperty('reading');
  expect(merged).not.toHaveProperty('review');
});

it('preserves complete canonical facts when there is no native repository', () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  const seed = useWorkspaceStore.getState().nodesById['node-1']!;
  useWorkspaceStore.setState({ nodesById: { 'node-1': { ...seed, reading, review } } });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.reading).toEqual(reading);
  expect(useWorkspaceStore.getState().nodesById['node-1']?.review).toEqual(review);
});
