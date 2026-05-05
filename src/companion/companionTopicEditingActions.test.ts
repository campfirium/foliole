import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

const syncObjectsMock = vi.hoisted(() => ({
  applyCompanionSyncNodeVersions: vi.fn(async () => ['topic-1'])
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createNode(overrides: Partial<WorkspaceSnapshot['nodesById'][string]> = {}) {
  return {
    anchorLink: null,
    content: 'Original body',
    createdAt: '2026-05-03T00:00:00.000Z',
    currentVersionId: 'desktop#topic-v1',
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
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...overrides
  };
}

function createSnapshot(node = createNode()): WorkspaceSnapshot {
  return {
    activeNodeId: node.id,
    nodeOrder: [node.id],
    nodesById: { [node.id]: node },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});

describe('companion topic editing actions persistence', () => {
  it('persists topic content as a node version and updates the local snapshot', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    const result = await persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot()
    });

    expect(result?.snapshot.nodesById['topic-1']).toMatchObject({
      bodyBlobHash: null,
      content: 'Edited body',
      currentVersionId: 'android-device#00000000-0000-4000-8000-000000000001',
      updatedAt: expect.any(String)
    });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        object_id: 'topic-1',
        parent_version_id: 'desktop#topic-v1',
        snapshot: expect.objectContaining({
          content: 'Edited body',
          updated_at: expect.any(String)
        }),
        version_id: 'android-device#00000000-0000-4000-8000-000000000001'
      })
    ]);
  });

  it('writes a node version even when the content matches the current snapshot', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    await persistCompanionTopicContent({
      content: 'Original body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot()
    });

    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledTimes(1);
  });

  it('rejects synced topic edits that do not have a base version id', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot(createNode({ currentVersionId: null }))
    })).rejects.toThrow('Topic edit requires a synced base version.');

    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
  });
});

describe('companion topic editing action guards', () => {
  it('does not write when the topic cannot be edited', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'missing',
      snapshot: createSnapshot()
    })).resolves.toBeNull();
    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot(createNode({ kind: 'folder' }))
    })).resolves.toBeNull();
    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: { ...createSnapshot(), trashedNodeIds: ['topic-1'] }
    })).resolves.toBeNull();
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
  });
});
