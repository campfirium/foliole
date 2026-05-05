import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

import {
  resolveCompanionArticleTitle,
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

function createExplicitArticleSnapshot() {
  return {
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createNodeRecord({
        content: '# First\n\nBody',
        createdAt: '2026-04-20T09:00:00.000Z',
        id: 'node-1',
        parentNodeId: 'folder-1',
        title: 'First',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }),
      'node-2': createNodeRecord({
        createdAt: '2026-04-19T09:00:00.000Z',
        id: 'node-2',
        parentNodeId: 'folder-1',
        title: 'Second',
        updatedAt: '2026-04-19T10:00:00.000Z'
      })
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

describe('companionReadableArticle title and reading helpers', () => {
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
      bodyStatus: 'ready',
      content: '# First\n\nBody',
      hideTitleHeading: false,
      nodeId: 'node-1',
      pdfAttachmentId: null,
      textAnchorDecorations: [],
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

  it('collects shared text anchor decorations for readable articles', () => {
    const snapshot: WorkspaceSnapshot = createExplicitArticleSnapshot();
    snapshot.nodeOrder = ['node-1', 'node-highlight'];
    const nextNodesById: WorkspaceSnapshot['nodesById'] = {
      ...snapshot.nodesById,
      'node-highlight': createNodeRecord({
      anchorLink: {
        id: 'highlight-1',
        kind: 'highlight',
        locator: { from: 8, originalText: 'Body', to: 12 }
      },
      content: 'Body',
      createdAt: '2026-04-20T09:30:00.000Z',
      id: 'node-highlight',
      kind: 'item',
      parentNodeId: 'node-1',
      title: 'Body highlight',
      updatedAt: '2026-04-21T10:30:00.000Z'
      })
    };
    snapshot.nodesById = nextNodesById;

    const result = resolveReadableCompanionArticleByNodeId(snapshot, 'node-1');

    expect(result?.textAnchorDecorations).toEqual([{ from: 8, kind: 'highlight', to: 12 }]);
  });
});
