import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';

import { resolveCompanionReadingNeighbors } from './companionReadingNeighbors';

function topic(id: string, parentNodeId: string | null = 'folder'): WorkspaceSnapshot['nodesById'][string] {
  return { anchorLink: null, content: `# ${id}`, createdAt: '2026-01-01', hideTitleHeading: false,
    id, isTitleManual: true, kind: 'topic', parentNodeId, reading: null,
    reveal: null, review: null, title: id, updatedAt: `2026-01-0${id === 'A' ? 1 : id === 'B' ? 2 : 3}` };
}
function snapshot(): WorkspaceSnapshot {
  return { activeNodeId: null, nodeOrder: ['folder', 'A', 'B', 'C', 'P', 'D', 'X'],
    nodesById: { folder: { ...topic('folder', null), kind: 'folder' }, A: topic('A'), B: topic('B'),
      C: topic('C'), P: topic('P'), D: topic('D', 'P'), X: topic('X', 'other') },
    trashedNodeIds: [], untitledSequenceByParent: {} };
}
function neighbors(state = snapshot(), selectedBrowseNodeId: string | null = 'B',
  options: Partial<Parameters<typeof resolveCompanionReadingNeighbors>[0]> = {}) {
  return resolveCompanionReadingNeighbors({ directorySelection: { kind: 'internal', nodeId: 'folder' },
    isBrowseDirectoryOpen: true, snapshot: state,
    surface: { selectedBrowseNodeId, browseReturnNodeId: null, recentArticles: [] },
    sort: { sortKey: 'dateSaved', sortDirection: 'asc' }, ...options });
}

it('uses the current directory sort, skips containers, and never crosses the directory boundary', () => {
  const state = snapshot();
  expect(neighbors(state)).toMatchObject({ previous: 'A', next: 'C' });
  expect(neighbors(state, 'B', { sort: { sortKey: 'dateSaved', sortDirection: 'desc' } }))
    .toMatchObject({ previous: 'C', next: 'A' });
  expect(neighbors(state, 'C')).toMatchObject({ previous: 'B', next: null });
  expect(neighbors(state, 'A')).toMatchObject({ previous: null, next: 'B' });
  expect(neighbors(state, 'P')).toMatchObject({ previous: null, next: null });
});

it('follows live virtual results and disables both directions when the current topic leaves them', () => {
  const state = snapshot();
  state.nodesById.folder = { ...state.nodesById.folder!, virtualFilter: createCollectionVirtualNodeFilter('Test') };
  state.virtualResultIdsByNodeId = { folder: ['C', 'B', 'A'] };
  const options = { directorySelection: { kind: 'virtual' as const, nodeId: 'folder' } };
  expect(neighbors(state, 'B', options)).toMatchObject({ previous: 'C', next: 'A' });
  const changed = { ...state, virtualResultIdsByNodeId: { folder: ['A', 'B', 'X'] } };
  expect(neighbors(changed, 'B', options)).toMatchObject({ previous: 'A', next: 'X' });
  expect(neighbors({ ...changed, virtualResultIdsByNodeId: { folder: ['A'] } }, 'B', options))
    .toMatchObject({ previous: null, next: null });
});

it('uses Browse list order across folders and the current container sublist within a container', () => {
  const state = snapshot();
  const recentArticles = ['C', 'B', 'X', 'A'].map(nodeId => ({ nodeId, title: nodeId, preview: null, updatedAt: '' }));
  expect(neighbors(state, 'B', { isBrowseDirectoryOpen: false,
    surface: { selectedBrowseNodeId: 'B', browseReturnNodeId: null, recentArticles } }))
    .toMatchObject({ previous: 'C', next: 'X' });
  state.nodesById.E = topic('E', 'P');
  state.nodeOrder.push('E');
  expect(neighbors(state, 'D', { isBrowseDirectoryOpen: false,
    surface: { selectedBrowseNodeId: 'D', browseReturnNodeId: 'P', recentArticles } }))
    .toMatchObject({ previous: null, next: 'E' });
});

it('disables missing, empty, single-topic and trash list targets', () => {
  expect(neighbors(snapshot(), null)).toMatchObject({ previous: null, next: null });
  expect(neighbors({ ...snapshot(), nodeOrder: [], nodesById: {} })).toMatchObject({ previous: null, next: null });
  expect(neighbors(snapshot(), 'D', { directorySelection: { kind: 'internal', nodeId: 'P' } }))
    .toMatchObject({ previous: null, next: null });
  expect(neighbors(snapshot(), 'B', { directorySelection: { kind: 'trash' } })).toMatchObject({ enabled: false });
});

it('follows the latest last-opened ordering even when opening changes the next neighbor', () => {
  const state = snapshot();
  const nodeOpenStateById = {
    A: { nodeId: 'A', lastOpenedAt: '2026-01-03T00:00:00Z' },
    B: { nodeId: 'B', lastOpenedAt: '2026-01-02T00:00:00Z' },
    C: { nodeId: 'C', lastOpenedAt: '2026-01-01T00:00:00Z' }
  };
  const options = { sort: { sortKey: 'dateLastOpened' as const, sortDirection: 'desc' as const } };
  expect(neighbors({ ...state, nodeOpenStateById }, 'B', options)).toMatchObject({ previous: 'A', next: 'C' });
  expect(neighbors({ ...state, nodeOpenStateById: { ...nodeOpenStateById,
    B: { nodeId: 'B', lastOpenedAt: '2026-01-04T00:00:00Z' } } }, 'B', options))
    .toMatchObject({ previous: null, next: 'A' });
});
