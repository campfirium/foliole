import { beforeEach, expect, it } from 'vitest';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
import {
  loadWorkspaceContentSortPreference,
  saveWorkspaceContentSortPreference,
  sortExternalDocuments,
  sortWorkspaceContentRows
} from './workspaceContentSort';

const baseDocument = {
  absolutePath: '/library/doc.md',
  extension: 'md' as const,
  fileName: 'doc.md',
  folderId: 'folder-1',
  openingText: null,
  relativePath: 'doc.md'
};

function createRow(id: string, title: string, updatedAt: string, createdAt = '2026-04-20T00:00:00.000Z'): NodeTreeRow {
  return {
    depth: 0,
    descendantCount: 0,
    hasChildren: false,
    node: {
      createdAt,
      hasContent: true,
      hasReveal: false,
      id,
      parentNodeId: null,
      review: null,
      title,
      updatedAt
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

it('persists the workspace content sort preference', () => {
  saveWorkspaceContentSortPreference({ direction: 'asc', key: 'name' });

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort)).toBe(
    JSON.stringify({ direction: 'asc', key: 'name' })
  );
  expect(loadWorkspaceContentSortPreference()).toEqual({ direction: 'asc', key: 'name' });
});

it('loads last opened as newest first even when an older preference stored ascending order', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort, JSON.stringify({ direction: 'asc', key: 'lastOpenedAt' }));

  expect(loadWorkspaceContentSortPreference()).toEqual({ direction: 'desc', key: 'lastOpenedAt' });
});

it('migrates previous saved/import time sort keys to modified time', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort, JSON.stringify({ direction: 'desc', key: 'savedAt' }));

  expect(loadWorkspaceContentSortPreference()).toEqual({ direction: 'desc', key: 'modifiedAt' });

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort, JSON.stringify({ direction: 'desc', key: 'importedAt' }));

  expect(loadWorkspaceContentSortPreference()).toEqual({ direction: 'desc', key: 'modifiedAt' });
});

it('sorts external documents by newest date by default and supports name descending', () => {
  const documents = [
    { ...baseDocument, modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Alpha' },
    { ...baseDocument, absolutePath: '/library/b.md', modifiedAt: '2026-04-22T00:00:00.000Z', title: 'Beta' }
  ];

  expect(sortExternalDocuments(documents, { direction: 'desc', key: 'modifiedAt' }).map((document) => document.title)).toEqual(['Beta', 'Alpha']);
  expect(sortExternalDocuments(documents, { direction: 'desc', key: 'name' }).map((document) => document.title)).toEqual(['Beta', 'Alpha']);
});

it('sorts external documents by last opened time when available', () => {
  const documents = [
    { ...baseDocument, absolutePath: '/library/a.md', modifiedAt: '2026-04-22T00:00:00.000Z', title: 'Alpha' },
    { ...baseDocument, absolutePath: '/library/b.md', modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Beta' }
  ];

  expect(
    sortExternalDocuments(documents, { direction: 'desc', key: 'lastOpenedAt' }, {
      '/library/a.md': '2026-04-23T00:00:00.000Z',
      '/library/b.md': '2026-04-24T00:00:00.000Z'
    }).map((document) => document.title)
  ).toEqual(['Beta', 'Alpha']);
});

it('sorts workspace content by last opened time when that context supports it', () => {
  const rows = [
    createRow('old', 'Old', '2026-04-22T00:00:00.000Z'),
    createRow('new', 'New', '2026-04-20T00:00:00.000Z')
  ];
  const nodeViewById = {
    new: { updatedAt: '2026-04-24T00:00:00.000Z' },
    old: { updatedAt: '2026-04-23T00:00:00.000Z' }
  };

  expect(sortWorkspaceContentRows(rows, { direction: 'desc', key: 'lastOpenedAt' }, nodeViewById).map((row) => row.node.id)).toEqual(['new', 'old']);
});

it('sorts workspace content by import time instead of later edits', () => {
  const rows = [
    createRow('edited-later', 'Edited later', '2026-04-25T00:00:00.000Z', '2026-04-20T00:00:00.000Z'),
    createRow('imported-later', 'Imported later', '2026-04-21T00:00:00.000Z', '2026-04-24T00:00:00.000Z')
  ];

  expect(sortWorkspaceContentRows(rows, { direction: 'desc', key: 'importedAt' }).map((row) => row.node.id)).toEqual(['imported-later', 'edited-later']);
});

it('sorts workspace content by modified time using updatedAt', () => {
  const rows = [
    createRow('edited-later', 'Edited later', '2026-04-25T00:00:00.000Z', '2026-04-20T00:00:00.000Z'),
    createRow('imported-later', 'Imported later', '2026-04-21T00:00:00.000Z', '2026-04-24T00:00:00.000Z')
  ];

  expect(sortWorkspaceContentRows(rows, { direction: 'desc', key: 'modifiedAt' }).map((row) => row.node.id)).toEqual(['edited-later', 'imported-later']);
});

it('keeps large sibling groups ordered without changing hierarchy', () => {
  const nodeCount = 600;
  const nodeIds = Array.from({ length: nodeCount }, (_, index) => `node-${index}`);
  const nodesById: WorkspaceListNodesById = {};
  nodeIds.forEach((nodeId, index) => {
    nodesById[nodeId] = {
      ...createRow(
        nodeId,
        `Node ${String(nodeCount - index).padStart(3, '0')}`,
        `2026-04-20T00:${String(index % 60).padStart(2, '0')}:00.000Z`
      ).node,
      parentNodeId: 'folder'
    };
  });
  nodesById.folder = {
    ...createRow('folder', 'Folder', '2026-04-20T00:00:00.000Z').node,
    hasContent: false
  };

  expect(
    sortWorkspaceContentNodeIds(['folder', ...nodeIds], nodesById, { direction: 'asc', key: 'name' }).slice(0, 5)
  ).toEqual(['folder', 'node-0', 'node-1', 'node-2', 'node-3']);
});

it('keeps child tree order independent from workspace content sort', () => {
  const nodesById: WorkspaceListNodesById = {
    folder: {
      ...createRow('folder', 'Folder', '2026-04-20T00:00:00.000Z').node,
      hasContent: false
    },
    lower: {
      ...createRow('lower', 'Lower anchor', '2026-04-24T00:00:00.000Z').node,
      anchorLink: { id: 'anchor-lower', kind: 'highlight', locator: { from: 20, originalText: 'Lower', to: 25 } },
      parentNodeId: 'folder'
    },
    upper: {
      ...createRow('upper', 'Upper anchor', '2026-04-20T00:00:00.000Z').node,
      anchorLink: { id: 'anchor-upper', kind: 'highlight', locator: { from: 5, originalText: 'Upper', to: 10 } },
      parentNodeId: 'folder'
    }
  };

  expect(sortWorkspaceContentNodeIds(['folder', 'lower', 'upper'], nodesById, { direction: 'desc', key: 'modifiedAt' })).toEqual([
    'folder',
    'upper',
    'lower'
  ]);
});

it('keeps native topic children in structural order when sorting siblings by name', () => {
  const nodesById: WorkspaceListNodesById = {
    topic: createRow('topic', 'Topic', '2026-04-20T00:00:00.000Z').node,
    childCn: {
      ...createRow('childCn', '中文 child', '2026-04-20T00:00:00.000Z').node,
      parentNodeId: 'topic'
    },
    childAi: {
      ...createRow('childAi', 'AI child', '2026-04-20T00:00:00.000Z').node,
      parentNodeId: 'topic'
    }
  };

  expect(sortWorkspaceContentNodeIds(['topic', 'childCn', 'childAi'], nodesById, { direction: 'asc', key: 'name' })).toEqual([
    'topic',
    'childCn',
    'childAi'
  ]);
});
