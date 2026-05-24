import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

const syncObjectsMock = vi.hoisted(() => ({
  applyCompanionSyncNodeVersions: vi.fn(async () => ['folder-1', 'topic-1'])
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createNode(overrides: Partial<WorkspaceSnapshot['nodesById'][string]> = {}) {
  return {
    anchorLink: null,
    content: 'Original body',
    createdAt: '2026-05-03T00:00:00.000Z',
    currentVersionId: 'desktop#node-v1',
    deletedAt: '2026-05-03T01:00:00.000Z',
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic' as const,
    openingText: null,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: '2026-05-03T01:00:00.000Z',
    ...overrides
  };
}

function createSnapshot(): WorkspaceSnapshot {
  const folder = createNode({ id: 'folder-1', kind: 'folder', title: 'Folder' });
  const topic = createNode({ id: 'topic-1', parentNodeId: 'folder-1' });
  return {
    activeNodeId: null,
    nodeOrder: [],
    nodesById: { 'folder-1': folder, 'topic-1': topic },
    trashedNodeDeletedAtById: {
      'folder-1': '2026-05-03T01:00:00.000Z',
      'topic-1': '2026-05-03T01:00:00.000Z'
    },
    trashedNodeIds: ['folder-1', 'topic-1'],
    untitledSequenceByParent: {}
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
});

describe('companion trash actions', () => {
  it('restores a trashed subtree through node versions', async () => {
    const { restoreCompanionTrashNode } = await import('./companionTrashActions');

    const result = await restoreCompanionTrashNode({
      deviceId: 'android-device',
      nodeId: 'folder-1',
      snapshot: createSnapshot()
    });

    expect(result?.snapshot.trashedNodeIds).toEqual([]);
    expect(result?.snapshot.nodeOrder).toEqual(['folder-1', 'topic-1']);
    expect(result?.snapshot.trashedNodeDeletedAtById).toEqual({});
    expect(result?.snapshot.nodesById['folder-1']).toMatchObject({ deletedAt: null });
    expect(result?.snapshot.nodesById['topic-1']).toMatchObject({ deletedAt: null });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        object_id: 'folder-1',
        snapshot: expect.objectContaining({ deleted_at: null })
      }),
      expect.objectContaining({
        object_id: 'topic-1',
        snapshot: expect.objectContaining({ deleted_at: null })
      })
    ]);
  });

  it('does not restore nodes whose lifecycle fact is already visible', async () => {
    const { restoreCompanionTrashNode } = await import('./companionTrashActions');
    const snapshot = createSnapshot();

    await expect(restoreCompanionTrashNode({
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: {
        ...snapshot,
        nodesById: {
          ...snapshot.nodesById,
          'topic-1': createNode({ deletedAt: null, parentNodeId: 'folder-1' })
        },
        trashedNodeIds: ['topic-1']
      }
    })).resolves.toBeNull();
  });
});
