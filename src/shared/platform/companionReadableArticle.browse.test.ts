import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRecentArticles,
  resolveCompanionRootDirectoryView
} from './companionBrowseLists';
import {
  resolveCompanionBrowseExitNodeId,
  resolveReadableCompanionArticleByNodeId,
  resolveReadableCompanionTrashArticleByNodeId
} from './companionReadableArticle';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createNodeRecord(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-04-17T09:00:00.000Z',
    hideTitleHeading: false,
    id: 'node-id',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Untitled',
    updatedAt: '2026-04-17T10:00:00.000Z',
    ...overrides
  };
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['folder-1', 'folder-2', 'node-1', 'node-2', 'node-3', 'node-5', 'node-6', 'node-7'],
    nodesById: {
      'folder-1': createNodeRecord({ id: 'folder-1', kind: 'folder', title: 'Reading folder' }),
      'folder-2': createNodeRecord({ id: 'folder-2', kind: 'folder', parentNodeId: 'folder-1', title: 'Nested folder' }),
      'folder-3': createNodeRecord({ deletedAt: '2026-04-22T11:00:00.000Z', id: 'folder-3', kind: 'folder', title: 'Archived folder' }),
      'node-1': createNodeRecord({ content: '# Older\n\nOlder body', id: 'node-1', parentNodeId: 'folder-1', title: 'Older note', updatedAt: '2026-04-20T10:00:00.000Z' }),
      'node-2': createNodeRecord({ content: '---\nauthor: Ada\n---\n# Newer\n\nLatest body', id: 'node-2', parentNodeId: 'folder-2', title: 'Newer note', updatedAt: '2026-04-21T10:00:00.000Z' }),
      'node-3': createNodeRecord({ id: 'node-3', parentNodeId: 'folder-1', title: 'Empty note', updatedAt: '2026-04-22T10:00:00.000Z' }),
      'node-4': createNodeRecord({ content: '# Hidden\n\nShould not show', deletedAt: '2026-04-22T12:00:00.000Z', id: 'node-4', parentNodeId: 'folder-1', title: 'Hidden note' }),
      'node-5': createNodeRecord({ content: '# Child\n\nShould not show', id: 'node-5', parentNodeId: 'node-2', title: 'Child topic' }),
      'node-6': createNodeRecord({ content: 'Prompt', id: 'node-6', kind: 'item', title: 'Cloze item', updatedAt: '2026-04-24T10:00:00.000Z' }),
      'node-7': createNodeRecord({ content: '# Root article\n\nStill article', id: 'node-7', title: 'Root article', updatedAt: '2026-04-19T11:00:00.000Z' })
    },
    trashedNodeDeletedAtById: {
      'folder-3': '2026-04-22T11:00:00.000Z',
      'node-4': '2026-04-22T12:00:00.000Z'
    },
    trashedNodeIds: ['folder-3', 'node-4'],
    untitledSequenceByParent: {}
  } satisfies WorkspaceSnapshot;
}

function createViewState(nodeId: string, updatedAt: string) {
  return {
    nodeId,
    scrollTop: 0,
    selectionFrom: null,
    selectionTo: null,
    source: 'user-scroll' as const,
    updatedAt
  };
}

describe('companionReadableArticle recent browse helpers', () => {
  it('builds recent articles in descending updated time order', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result.map((article) => article.nodeId)).toEqual(['node-2', 'node-1', 'node-7']);
    expect(result[0]).toMatchObject({
      authorLabel: 'Ada',
      folderLabel: 'Nested folder',
      preview: 'Latest body',
      title: 'Newer',
      updatedAt: '2026-04-21T10:00:00.000Z'
    });
  });

  it('builds recent articles in descending last opened time order when view state is available', () => {
    const snapshot = createSnapshot();
    snapshot.persistedNodeViewById = {
      'node-1': createViewState('node-1', '2026-04-25T10:00:00.000Z'),
      'node-2': createViewState('node-2', '2026-04-24T10:00:00.000Z')
    };

    expect(resolveCompanionRecentArticles(snapshot, 'dateLastOpened').map((article) => article.nodeId)).toEqual(['node-1', 'node-2', 'node-7']);
  });

  it('excludes child topics and cloze items from recent articles', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result.some((article) => article.nodeId === 'node-5')).toBe(false);
    expect(result.some((article) => article.nodeId === 'node-6')).toBe(false);
  });

  it('keeps folder-contained topics as articles', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result.some((article) => article.nodeId === 'node-1')).toBe(true);
    expect(result.some((article) => article.nodeId === 'node-2')).toBe(true);
  });

  it('reuses the desktop author metadata rule for recent articles', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result.find((article) => article.nodeId === 'node-2')).toMatchObject({
      authorLabel: 'Ada',
      folderLabel: 'Nested folder'
    });
    expect(result.find((article) => article.nodeId === 'node-7')).toMatchObject({
      authorLabel: null,
      folderLabel: null
    });
  });
});

describe('companionReadableArticle directory browse helpers', () => {
  it('builds a direct-child folder view for companion browsing', () => {
    const result = resolveCompanionFolderViewByNodeId(createSnapshot(), 'folder-1');

    expect(result).toMatchObject({
      items: [
        { kind: 'topic', nodeId: 'node-3', preview: null, title: 'Empty note' },
        { kind: 'topic', nodeId: 'node-1', preview: 'Older body', title: 'Older' },
        { kind: 'folder', nodeId: 'folder-2', preview: null, title: 'Nested folder' }
      ],
      nodeId: 'folder-1',
      title: 'Reading folder'
    });
  });

  it('builds folder views in descending last opened time order when view state is available', () => {
    const snapshot = createSnapshot();
    snapshot.persistedNodeViewById = {
      'folder-2': createViewState('folder-2', '2026-04-25T10:00:00.000Z'),
      'node-1': createViewState('node-1', '2026-04-24T10:00:00.000Z')
    };

    expect(resolveCompanionFolderViewByNodeId(snapshot, 'folder-1', 'dateLastOpened')?.items.map((item) => item.nodeId)).toEqual([
      'folder-2',
      'node-1',
      'node-3'
    ]);
  });

  it('builds the root directory from top-level folders only', () => {
    const result = resolveCompanionRootDirectoryView(createSnapshot());

    expect(result.items).toMatchObject([
      { kind: 'folder', nodeId: 'folder-1', preview: null, title: 'Reading folder' }
    ]);
  });

  it('returns the parent folder as the companion browse exit target', () => {
    expect(resolveCompanionBrowseExitNodeId(createSnapshot(), 'node-1')).toBe('folder-1');
    expect(resolveCompanionBrowseExitNodeId(createSnapshot(), 'node-7')).toBeNull();
    expect(resolveCompanionBrowseExitNodeId(createSnapshot(), 'node-4')).toBeNull();
  });

  it('opens trashed topics only through the trash reader path', () => {
    expect(resolveReadableCompanionArticleByNodeId(createSnapshot(), 'node-4')).toBeNull();
    expect(resolveReadableCompanionTrashArticleByNodeId(createSnapshot(), 'node-4')).toMatchObject({
      isTrashed: true,
      nodeId: 'node-4',
      title: 'Hidden'
    });
  });
});
