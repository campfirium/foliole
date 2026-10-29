import { beforeEach, expect, it } from 'vitest';

import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { mergePendingNodeSyncIntoSnapshot, stagePendingNodeSync } from './workspacePendingNodeSync';
import { createPendingNodeSnapshotFixture, createRuntimeNodeSnapshotFixture } from './workspacePendingNodeSyncReplay.testSupport';

beforeEach(() => localStorage.clear());
const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: '2026-10-29T01:00:00.000Z',
  nextAt: '2026-10-29T01:00:00.000Z', priority: 3, readingPosition: 27, repetitionCount: 9, state: 'active' as const };

it('leaves unknown learning out of content payloads while retaining explicit clear intentions', () => {
  const node = createRuntimeNodeSnapshotFixture();
  const { reading: ignoredReading, review: ignoredReview, ...content } = node;
  void ignoredReading; void ignoredReview;
  const payload = createWorkspaceRuntimeNodeSnapshot(content);
  expect(payload).not.toHaveProperty('reading');
  expect(payload).not.toHaveProperty('review');
  expect(createWorkspaceRuntimeNodeSnapshot(node)).toMatchObject({ reading: null, review: null });
});

it.each([undefined, null])('preserves database reading on pending content overlay unless explicitly cleared (%s)', value => {
  const { reading: ignoredReading, ...pending } = createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:03.000Z' });
  void ignoredReading;
  stagePendingNodeSync({ ...pending, ...(value === null ? { reading: null } : {}) });
  const result = mergePendingNodeSyncIntoSnapshot({ activeNodeId: null, nodeOrder: ['node-1'], trashedNodeIds: [],
    nodesById: { 'node-1': { ...createRuntimeNodeSnapshotFixture(), reading } } });
  expect(result?.nodesById['node-1']?.reading).toEqual(value === null ? null : reading);
});
