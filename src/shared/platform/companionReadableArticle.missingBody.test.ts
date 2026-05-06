import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import { resolveCompanionRecentArticles } from './companionBrowseLists';
import {
  resolveReadableCompanionArticleByNodeId
} from './companionReadableArticle';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createNodeRecord(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    anchorLink: null,
    bodyStatus: 'missing',
    content: '',
    createdAt: '2026-04-20T09:00:00.000Z',
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic',
    openingText: 'Opening text from the synced pack',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Synced topic',
    updatedAt: '2026-04-21T10:00:00.000Z',
    ...overrides
  };
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'topic-1': createNodeRecord()
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

  it('keeps missing body topics selectable with metadata', () => {
    const result = resolveReadableCompanionArticleByNodeId(createSnapshot(), 'topic-1');

    expect(result).toMatchObject({
      bodyStatus: 'missing',
      content: '',
      nodeId: 'topic-1',
      title: 'Synced topic'
    });
  });

  it('keeps empty body topics selectable with an empty status', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = {
      ...snapshot.nodesById['topic-1'],
      bodyStatus: 'empty',
      openingText: null
    };

    const result = resolveReadableCompanionArticleByNodeId(snapshot, 'topic-1');

    expect(result).toMatchObject({
      bodyStatus: 'empty',
      content: '',
      nodeId: 'topic-1',
      title: 'Synced topic'
    });
  });

  it('keeps missing body topics in recent articles with opening text metadata', () => {
    const result = resolveCompanionRecentArticles(createSnapshot());

    expect(result[0]).toMatchObject({
      bodyStatus: 'missing',
      nodeId: 'topic-1',
      preview: 'Opening text from the synced pack'
    });
  });

  it('keeps empty body topics in recent articles without treating them as missing', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = {
      ...snapshot.nodesById['topic-1'],
      bodyStatus: 'empty',
      openingText: null
    };

    const result = resolveCompanionRecentArticles(snapshot);

    expect(result[0]).toMatchObject({
      bodyStatus: 'empty',
      nodeId: 'topic-1',
      preview: null
    });
  });

  it('keeps fetching body topics selectable for status display', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = {
      ...snapshot.nodesById['topic-1'],
      bodyStatus: 'fetching'
    };

    expect(resolveReadableCompanionArticleByNodeId(snapshot, 'topic-1')).toMatchObject({
      bodyStatus: 'fetching',
      nodeId: 'topic-1'
    });
  });

  it('keeps failed body topics in recent articles for status display', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = {
      ...snapshot.nodesById['topic-1'],
      bodyStatus: 'failed'
    };

    expect(resolveCompanionRecentArticles(snapshot)[0]).toMatchObject({
      bodyStatus: 'failed',
      nodeId: 'topic-1'
    });
  });
