import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

import {
  resolveCompanionArticleTitle,
  resolveCompanionRecentArticles,
  resolveReadableCompanionArticleByNodeId
} from './companionReadableArticle';

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

function createFolderNodes() {
  return {
    'folder-1': createNodeRecord({
      id: 'folder-1',
      kind: 'folder',
      title: 'Reading folder'
    }),
    'folder-2': createNodeRecord({
      createdAt: '2026-04-17T09:30:00.000Z',
      id: 'folder-2',
      kind: 'folder',
      parentNodeId: 'folder-1',
      title: 'Nested folder',
      updatedAt: '2026-04-17T10:30:00.000Z'
    })
  };
}

function createArticleNodes() {
  return {
    'node-1': createNodeRecord({
      content: '# Older\n\nOlder body',
      createdAt: '2026-04-18T09:00:00.000Z',
      id: 'node-1',
      parentNodeId: 'folder-1',
      title: 'Older note',
      updatedAt: '2026-04-20T10:00:00.000Z'
    }),
    'node-2': createNodeRecord({
      content: '# Newer\n\nLatest body',
      createdAt: '2026-04-19T09:00:00.000Z',
      id: 'node-2',
      parentNodeId: 'folder-2',
      title: 'Newer note',
      updatedAt: '2026-04-21T10:00:00.000Z'
    }),
    'node-3': createNodeRecord({
      createdAt: '2026-04-22T09:00:00.000Z',
      id: 'node-3',
      parentNodeId: 'folder-1',
      title: 'Empty note',
      updatedAt: '2026-04-22T10:00:00.000Z'
    }),
    'node-4': createNodeRecord({
      content: '# Hidden\n\nShould not show',
      createdAt: '2026-04-22T09:00:00.000Z',
      id: 'node-4',
      parentNodeId: 'folder-1',
      title: 'Hidden note',
      updatedAt: '2026-04-22T10:00:00.000Z'
    }),
    'node-7': createNodeRecord({
      content: '# Root article\n\nStill article',
      createdAt: '2026-04-16T09:00:00.000Z',
      id: 'node-7',
      title: 'Root article',
      updatedAt: '2026-04-19T11:00:00.000Z'
    })
  };
}

function createDerivedNodes() {
  return {
    'node-5': createNodeRecord({
      content: '# Child\n\nShould not show',
      createdAt: '2026-04-22T09:00:00.000Z',
      id: 'node-5',
      parentNodeId: 'node-2',
      title: 'Child topic',
      updatedAt: '2026-04-23T10:00:00.000Z'
    }),
    'node-6': createNodeRecord({
      content: 'Prompt',
      createdAt: '2026-04-22T09:00:00.000Z',
      id: 'node-6',
      kind: 'item',
      title: 'Cloze item',
      updatedAt: '2026-04-24T10:00:00.000Z'
    })
  };
}

function createSnapshotNodes() {
  return {
    ...createFolderNodes(),
    ...createArticleNodes(),
    ...createDerivedNodes()
  };
}

function createSnapshot() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['folder-1', 'folder-2', 'node-1', 'node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7'],
    nodesById: createSnapshotNodes(),
    trashedNodeIds: ['node-4'],
    untitledSequenceByParent: {}
  } satisfies WorkspaceSnapshot;
}

function createExplicitArticleSnapshot() {
  const snapshot = createSnapshot();
  snapshot.activeNodeId = 'node-1';
  snapshot.nodeOrder = ['node-1', 'node-2'];
  snapshot.nodesById['node-1'] = {
    ...createNodeRecord(),
    content: '# First\n\nBody',
    createdAt: '2026-04-20T09:00:00.000Z',
    id: 'node-1',
    kind: 'topic',
    parentNodeId: 'folder-1',
    title: 'First',
    updatedAt: '2026-04-21T10:00:00.000Z'
  };
  snapshot.nodesById['node-2'] = {
    ...createNodeRecord(),
    content: '',
    createdAt: '2026-04-19T09:00:00.000Z',
    id: 'node-2',
    kind: 'topic',
    parentNodeId: 'folder-1',
    title: 'Second',
    updatedAt: '2026-04-19T10:00:00.000Z'
  };
  snapshot.trashedNodeIds = [];
  return snapshot;
}

describe('companionReadableArticle helpers', () => {
  it('prefers the article heading over the topic node title', () => {
    const articleNode = createNodeRecord({
      content: '# Imported article title\n\nBody',
      id: 'article-1',
      parentNodeId: 'folder-1',
      title: 'Node title fallback'
    });

    expect(resolveCompanionArticleTitle(articleNode)).toBe('Imported article title');
  });

  it('resolves a readable article by explicit node id', () => {
    const snapshot = createExplicitArticleSnapshot();

    const result = resolveReadableCompanionArticleByNodeId(snapshot, 'node-1');

    expect(result).toEqual({
      content: '# First\n\nBody',
      hideTitleHeading: false,
      nodeId: 'node-1',
      title: 'First'
    });
  });

  it('preserves hideTitleHeading for readable articles', () => {
    const snapshot = createExplicitArticleSnapshot();
    snapshot.nodesById['node-1'] = {
      ...snapshot.nodesById['node-1'],
      hideTitleHeading: true
    };

    const result = resolveReadableCompanionArticleByNodeId(snapshot, 'node-1');

    expect(result?.hideTitleHeading).toBe(true);
  });

  it('builds recent articles in descending updated time order', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result.map((article) => article.nodeId)).toEqual(['node-2', 'node-1', 'node-7']);
    expect(result[0]).toMatchObject({
      preview: 'Latest body',
      title: 'Newer',
      updatedAt: '2026-04-21T10:00:00.000Z'
    });
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
});
