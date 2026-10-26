import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

export function createNodeRecord(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
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

export function createExplicitArticleSnapshot() {
  return {
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'folder-1': createNodeRecord({
        id: 'folder-1',
        kind: 'folder',
        title: 'Folder'
      }),
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
