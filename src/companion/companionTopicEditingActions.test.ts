import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';

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

function createSnapshot(...nodes: Array<ReturnType<typeof createNode>>): WorkspaceSnapshot {
  const snapshotNodes = nodes.length > 0 ? nodes : [createNode()];
  return {
    activeNodeId: snapshotNodes[0]!.id,
    nodeOrder: snapshotNodes.map((node) => node.id),
    nodesById: Object.fromEntries(snapshotNodes.map((node) => [node.id, node])),
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  let uuidIndex = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidIndex += 1;
    return `00000000-0000-4000-8000-${uuidIndex.toString().padStart(12, '0')}`;
  });
});

function readAppliedVersions() {
  const call = syncObjectsMock.applyCompanionSyncNodeVersions.mock.calls[0] as [NativeSyncNodeRecord[]] | undefined;
  return call?.[0] ?? [];
}

describe('companion topic content persistence', () => {
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
      currentVersionId: 'ver_00000000-0000-4000-8000-000000000001',
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
        version_id: 'ver_00000000-0000-4000-8000-000000000001'
      })
    ]);
  });

  it('does not write a node version when the content matches the current snapshot', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    const result = await persistCompanionTopicContent({
      content: 'Original body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot()
    });

    expect(result?.snapshot.nodesById['topic-1']?.currentVersionId).toBe('desktop#topic-v1');
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
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

describe('companion topic child anchor remap persistence', () => {
  it('remaps anchored child nodes when parent topic content shifts', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');
    const parent = createNode({ content: 'Alpha Beta Gamma' });
    const child = createNode({
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      content: 'Beta',
      currentVersionId: 'desktop#child-v1',
      id: 'child-1',
      parentNodeId: 'topic-1',
      title: 'Beta'
    });

    const result = await persistCompanionTopicContent({
      content: 'Start Alpha Beta Gamma',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot(parent, child)
    });
    const writtenVersions = readAppliedVersions();
    const childAnchor = JSON.parse(writtenVersions[1]?.snapshot.anchor_link ?? '{}') as {
      locator: { from: number; originalText: string; to: number };
    };

    expect(writtenVersions).toHaveLength(2);
    expect(writtenVersions[0]).toMatchObject({ object_id: 'topic-1' });
    expect(writtenVersions[1]).toMatchObject({
      object_id: 'child-1',
      parent_version_id: 'desktop#child-v1'
    });
    expect(childAnchor.locator).toEqual({ from: 12, originalText: 'Beta', to: 16 });
    expect(result?.snapshot.nodesById['child-1']).toMatchObject({
      anchorLink: expect.objectContaining({ locator: { from: 12, originalText: 'Beta', to: 16 } }),
      currentVersionId: 'ver_00000000-0000-4000-8000-000000000002'
    });
  });
});

describe('companion topic child anchor remap no-op persistence', () => {
  it('does not write child node versions when remapped anchors do not change', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');
    const parent = createNode({ content: 'Alpha Beta Gamma' });
    const child = createNode({
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 0, originalText: 'Alpha', to: 5 }
      },
      content: 'Alpha',
      currentVersionId: 'desktop#child-v1',
      id: 'child-1',
      parentNodeId: 'topic-1',
      title: 'Alpha'
    });

    await persistCompanionTopicContent({
      content: 'Alpha Beta Gamma.',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot(parent, child)
    });

    expect(readAppliedVersions()).toHaveLength(1);
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

  it('uses lifecycle facts instead of stale legacy trash projection', async () => {
    const { persistCompanionTopicContent } = await import('./companionTopicEditingActions');

    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: {
        ...createSnapshot(createNode({ deletedAt: null })),
        trashedNodeIds: ['topic-1']
      }
    })).resolves.toMatchObject({ nodeId: 'topic-1' });
    await expect(persistCompanionTopicContent({
      content: 'Edited body',
      deviceId: 'android-device',
      nodeId: 'topic-1',
      snapshot: createSnapshot(createNode({ deletedAt: '2026-05-24T00:00:00.000Z' }))
    })).resolves.toBeNull();
  });
});
