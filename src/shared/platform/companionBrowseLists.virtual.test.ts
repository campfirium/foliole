import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { createCollectionVirtualNodeFilter, createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';

import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView
} from './companionBrowseLists';

function topic(id: string, title: string, collections: string[] = []) {
  return {
    anchorLink: null,
    collections,
    content: '',
    createdAt: '2026-07-28T00:00:00.000Z',
    hideTitleHeading: false,
    id,
    isTitleManual: true,
    kind: 'topic' as const,
    openingText: null,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
}

function folder(id: string, title: string, parentNodeId: string | null = null) {
  return {
    ...topic(id, title),
    kind: 'folder' as const,
    parentNodeId
  };
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodeOrder: ['special-virtual-root', 'collection-guide', 'manual', 'topic-b', 'topic-a', 'topic-deleted'],
    nodesById: {
      'special-virtual-root': folder('special-virtual-root', 'Virtual'),
      'collection-guide': {
        ...folder('collection-guide', 'Guide', 'special-virtual-root'),
        manualChildOrder: ['topic-a', 'missing'],
        virtualFilter: createCollectionVirtualNodeFilter('Guide')
      },
      manual: {
        ...folder('manual', 'Manual', 'special-virtual-root'),
        manualChildOrder: ['topic-b', 'missing', 'topic-a'],
        virtualFilter: createManualVirtualNodeFilter()
      },
      'topic-a': topic('topic-a', 'Alpha', ['Guide']),
      'topic-b': topic('topic-b', 'Beta', ['Guide']),
      'topic-deleted': {
        ...topic('topic-deleted', 'Deleted', ['Guide']),
        deletedAt: '2026-07-28T01:00:00.000Z'
      }
    },
    trashedNodeDeletedAtById: { 'topic-deleted': '2026-07-28T01:00:00.000Z' },
    trashedNodeIds: ['topic-deleted'],
    untitledSequenceByParent: {}
  };
}

it('opens the Virtual root as containers before opening a Collection as YAML-matched topics', () => {
  const snapshot = createSnapshot();

  expect(resolveCompanionRootDirectoryView(snapshot).items.map((item) => item.nodeId)).toEqual(['special-virtual-root']);
  expect(resolveCompanionFolderViewByNodeId(snapshot, 'special-virtual-root')?.items.map((item) => item.nodeId))
    .toEqual(['collection-guide', 'manual']);
  expect(resolveCompanionFolderViewByNodeId(snapshot, 'collection-guide')?.items.map((item) => item.nodeId))
    .toEqual(['topic-a', 'topic-b']);
});

it('uses manual virtual folder order without stale or deleted ids', () => {
  expect(resolveCompanionFolderViewByNodeId(createSnapshot(), 'manual')?.items.map((item) => item.nodeId))
    .toEqual(['topic-b', 'topic-a']);
});
