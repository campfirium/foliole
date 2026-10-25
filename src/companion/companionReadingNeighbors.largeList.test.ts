import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { resolveCompanionReadingNeighbors } from './companionReadingNeighbors';

it('keeps large Browse neighbor resolution within a usable interaction deadline', () => {
  const nodesById: WorkspaceSnapshot['nodesById'] = {};
  const recentArticles = Array.from({ length: 5_000 }, (_, index) => {
    const nodeId = `topic-${index}`;
    nodesById[nodeId] = { id: nodeId, parentNodeId: null, kind: 'topic', title: nodeId,
      content: 'Body', anchorLink: null, hideTitleHeading: false, isTitleManual: true,
      reading: null, reveal: null, review: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    return { nodeId, title: nodeId, preview: 'Body', updatedAt: '2026-01-01' };
  });
  const snapshot: WorkspaceSnapshot = { nodesById, nodeOrder: recentArticles.map(item => item.nodeId),
    activeNodeId: null, trashedNodeIds: [], untitledSequenceByParent: {} };
  const args = { directorySelection: { kind: 'root' as const }, isBrowseDirectoryOpen: false, snapshot,
    sort: { sortKey: 'dateSaved' as const, sortDirection: 'desc' as const },
    surface: { selectedBrowseNodeId: 'topic-2500', browseReturnNodeId: null, recentArticles } };
  const started = performance.now();
  expect(resolveCompanionReadingNeighbors(args)).toMatchObject({ previous: 'topic-2499', next: 'topic-2501' });
  expect(resolveCompanionReadingNeighbors({ ...args, surface: { ...args.surface, selectedBrowseNodeId: null } }))
    .toMatchObject({ previous: null, next: null });
  expect(performance.now() - started).toBeLessThan(5_000);
});
