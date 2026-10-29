import { expect, it } from 'vitest';

import { createWorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import type { WorkspaceState } from './workspaceStore';

it('retains parent restore facts without retaining its unrelated answer, reading or resource data', () => {
  const timestamp = '2026-10-29T00:00:00.000Z';
  const parent = { id: 'parent', parentNodeId: null, kind: 'topic' as const, title: 'Parent',
    isTitleManual: false, hideTitleHeading: false, hasContent: true, content: '# Parent',
    anchorLink: null, hasReveal: true, reveal: 'An unrelated saved answer', review: null,
    createdAt: timestamp, updatedAt: timestamp, manualChildOrder: null,
    reading: { intervalDurationMs: 1000, intervalGrowthFactor: 1.5, lastHandledAt: timestamp,
      nextAt: '2030-01-01T00:00:00.000Z', priority: 3, readingPosition: 0.4, repetitionCount: 2, state: 'active' as const },
    imageSources: { image: 'https://example.test/image.png' },
    imageRegions: [{ attachmentId: 'image', regions: [{ id: 'region', x: 0, y: 0, width: 0.5, height: 0.5 }] }] };
  const before = { activeNodeId: 'parent', browseRootNodeId: 'parent',
    reviewSession: { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 },
    navigation: { backStack: [], forwardStack: [] }, nodeOrder: ['parent', 'child'],
    nodesById: { parent, child: { ...parent, id: 'child', parentNodeId: 'parent', kind: 'item' } },
    trashedNodeDeletedAtById: {}, trashedNodeIds: [] } as unknown as WorkspaceState;
  const after = { ...before, nodesById: { ...before.nodesById, parent: { ...parent, imageRegions: null } },
    trashedNodeDeletedAtById: { child: timestamp }, trashedNodeIds: ['child'] };
  const entry = createWorkspaceDeleteHistoryEntry({ beforeState: before, afterState: after, kind: 'item', rootNodeId: 'child',
    mutation: { nodeIds: ['child'], deletedAt: timestamp, parentNodesToSync: [after.nodesById.parent], patch: after } });
  expect(entry.beforeParentNodesById.parent?.imageRegions).toEqual(parent.imageRegions);
  expect(entry.afterParentNodesById.parent?.imageRegions).toBeNull();
  for (const snapshot of [entry.beforeParentNodesById.parent!, entry.afterParentNodesById.parent!]) {
    expect(snapshot).toMatchObject({ content: parent.content, updatedAt: timestamp, manualChildOrder: null });
    for (const field of ['reveal', 'reading', 'review', 'imageSources', 'attachments', 'title', 'anchorLink']) {
      expect(snapshot).not.toHaveProperty(field);
    }
  }
});
