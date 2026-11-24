import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import { resolveCompanionOpenHistory } from './companionOpenHistory';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function node(overrides: Partial<SnapshotNode> & Pick<SnapshotNode, 'id'>): SnapshotNode {
  return {
    anchorLink: null, content: `# ${overrides.id}\n\nBody of ${overrides.id}`, createdAt: '2026-04-17T09:00:00.000Z',
    hideTitleHeading: false, isTitleManual: false, kind: 'topic', parentNodeId: null, reading: null, reveal: null,
    review: null, title: overrides.id, updatedAt: '2026-04-17T10:00:00.000Z', ...overrides
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodeOrder: ['folder', 'article', 'child', 'never', 'folder-open'],
    nodesById: {
      folder: node({ content: '', id: 'folder', kind: 'folder', title: 'Reading' }),
      'folder-open': node({ content: '', id: 'folder-open', kind: 'folder' }),
      article: node({ id: 'article', parentNodeId: 'folder' }),
      child: node({ id: 'child', parentNodeId: 'article' }),
      never: node({ id: 'never' }),
      trashed: node({ deletedAt: '2026-04-22T12:00:00.000Z', id: 'trashed' })
    },
    nodeOpenStateById: {
      article: { lastOpenedAt: '2026-04-20T10:00:00.000Z', nodeId: 'article' },
      child: { lastOpenedAt: '2026-04-21T10:00:00.000Z', nodeId: 'child' },
      'folder-open': { lastOpenedAt: '2026-04-23T10:00:00.000Z', nodeId: 'folder-open' },
      missing: { lastOpenedAt: '2026-04-24T10:00:00.000Z', nodeId: 'missing' },
      trashed: { lastOpenedAt: '2026-04-25T10:00:00.000Z', nodeId: 'trashed' }
    },
    trashedNodeDeletedAtById: { trashed: '2026-04-22T12:00:00.000Z' },
    trashedNodeIds: ['trashed'],
    untitledSequenceByParent: {}
  } satisfies WorkspaceSnapshot;
}

describe('resolveCompanionOpenHistory', () => {
  it('lists opened visible topics newest first, including child topics', () => {
    const history = resolveCompanionOpenHistory(snapshot());

    expect(history.map((item) => item.nodeId)).toEqual(['child', 'article']);
    expect(history[1]).toMatchObject({ folderLabel: 'Reading', preview: 'Body of article', updatedAt: '2026-04-20T10:00:00.000Z' });
  });

  it('caps the list and is empty without open records', () => {
    expect(resolveCompanionOpenHistory(snapshot(), 1).map((item) => item.nodeId)).toEqual(['child']);
    expect(resolveCompanionOpenHistory({ ...snapshot(), nodeOpenStateById: {} })).toEqual([]);
    expect(resolveCompanionOpenHistory(null)).toEqual([]);
  });
});
