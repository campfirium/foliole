import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import * as snapshotContract from '../../../lib/core/database/workspaceSnapshotContract';
import * as virtualResults from '../../../lib/core/nodes/virtualNodeResults';
import { resolveDirectoryRowMeta } from '../../companion/CompanionDirectoryVisualModel';

import { countCompanionExternalDirectoryEntries, resolveCompanionDirectoryCounts } from './companionDirectoryCounts';
import type { CompanionExternalDirectory } from './companionExternalDocuments';

function node(id: string, parentNodeId: string | null = null): WorkspaceSnapshot['nodesById'][string] {
  return {
    id, parentNodeId, kind: 'topic', title: id, content: '', isTitleManual: false,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-09-22', updatedAt: '2026-09-22'
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodesById: {
      folder: { ...node('folder'), kind: 'folder' },
      child: node('child', 'folder'),
      nested: node('nested', 'child'),
      deleted: { ...node('deleted', 'folder'), deletedAt: '2026-09-22' },
      hidden: node('hidden', 'deleted'),
      legacy: node('legacy', 'folder')
    },
    nodeOrder: ['folder', 'child', 'nested', 'deleted', 'hidden', 'legacy'],
    trashedNodeIds: ['legacy'],
    untitledSequenceByParent: {}
  };
}

function entry(folderId: string, relativePath: string): CompanionExternalDirectory['entries'][number] {
  return {
    folderId, relativePath, documentId: relativePath, absolutePath: relativePath,
    extension: 'md', fileName: relativePath, modifiedAt: '', openingText: null, title: relativePath
  };
}

afterEach(() => vi.restoreAllMocks());

it('normalizes once for multiple folder rows and session-only changes', () => {
  const source = snapshot();
  const normalize = vi.spyOn(snapshotContract, 'normalizeWorkspaceSnapshot');
  const directory = { entries: [], folders: [] };
  const item = { id: 'folder', nodeId: 'folder', kind: 'folder' as const,
    source: 'internal' as const, title: 'folder', preview: null, updatedAt: '' };
  expect(resolveDirectoryRowMeta({ directory, item, snapshot: source })).toBe('1');
  expect(resolveDirectoryRowMeta({ directory, item: { ...item, nodeId: 'child' }, snapshot: source })).toBe('1');
  expect(resolveDirectoryRowMeta({ directory, item, snapshot: { ...source, activeNodeId: 'child' } })).toBe('1');
  expect(normalize).toHaveBeenCalledTimes(1);
});

it('preserves direct-child, ancestor visibility and legacy trash semantics', () => {
  const counts = resolveCompanionDirectoryCounts(snapshot());
  expect(counts.countChildren('folder', 'visible')).toBe(1);
  expect(counts.countChildren('deleted', 'visible')).toBe(0);
  expect(counts.countChildren('folder', 'trash')).toBe(2);
  expect(counts.trashCount).toBe(2);
});

it('updates counts when membership or parent inputs change', () => {
  const source = snapshot();
  resolveCompanionDirectoryCounts(source);
  const restored = { ...source, trashedNodeIds: [] };
  expect(resolveCompanionDirectoryCounts(restored).countChildren('folder', 'visible')).toBe(2);
  const moved = { ...restored, nodesById: { ...source.nodesById, child: node('child') } };
  expect(resolveCompanionDirectoryCounts(moved).countChildren('folder', 'visible')).toBe(1);
  const legacyDeleted = { ...moved, trashedNodeDeletedAtById: { legacy: '2026-09-22' } };
  expect(resolveCompanionDirectoryCounts(legacyDeleted).countChildren('folder', 'visible')).toBe(0);
});

it('resolves virtual folders lazily and reuses the result until filter inputs change', () => {
  const source = snapshot();
  source.nodesById.virtual = { ...node('virtual'), kind: 'folder', virtualFilter: {
    version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'child' }]
  } };
  const createResolver = vi.spyOn(virtualResults, 'createVirtualNodeResultResolver');
  const counts = resolveCompanionDirectoryCounts(source);
  expect(createResolver).not.toHaveBeenCalled();
  expect(counts.countVirtualResults('virtual')).toBe(1);
  expect(counts.countVirtualResults('virtual')).toBe(1);
  expect(createResolver).toHaveBeenCalledTimes(1);
  const supplied = { ...source, virtualResultIdsByNodeId: { virtual: ['child', 'nested'] } };
  expect(resolveCompanionDirectoryCounts(supplied).countVirtualResults('virtual')).toBe(2);
  expect(createResolver).toHaveBeenCalledTimes(1);
  const changed = { ...source, nodesById: { ...source.nodesById, child: { ...node('child'), title: 'Other' } } };
  expect(resolveCompanionDirectoryCounts(changed).countVirtualResults('virtual')).toBe(0);
});

it('counts external descendants once per entries input without crossing folder or path boundaries', () => {
  const entries = [entry('a', 'x/one.md'), entry('a', 'x/y/two.md'), entry('a', 'xy/three.md'), entry('b', 'x/four.md')];
  Object.defineProperty(entries[0], 'relativePath', { configurable: true, get: () => 'x/one.md' });
  const pathRead = vi.spyOn(entries[0]!, 'relativePath', 'get');
  expect(countCompanionExternalDirectoryEntries(entries, 'a')).toBe(3);
  const initialReads = pathRead.mock.calls.length;
  expect(countCompanionExternalDirectoryEntries(entries, 'a', 'x')).toBe(2);
  expect(countCompanionExternalDirectoryEntries(entries, 'a', 'x/y')).toBe(1);
  expect(countCompanionExternalDirectoryEntries(entries, 'b', 'x')).toBe(1);
  expect(pathRead).toHaveBeenCalledTimes(initialReads);
  expect(countCompanionExternalDirectoryEntries([...entries, entry('a', 'x/new.md')], 'a', 'x')).toBe(3);
});
