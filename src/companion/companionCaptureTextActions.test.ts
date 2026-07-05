import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

const syncObjectsMock = vi.hoisted(() => ({
  applyCompanionSyncNodeVersions: vi.fn(async () => ['node-created'])
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID],
    nodesById: {
      [INBOX_NODE_ID]: {
        anchorLink: null,
        content: '',
        createdAt: '2026-05-03T00:00:00.000Z',
        hideTitleHeading: false,
        id: INBOX_NODE_ID,
        isTitleManual: false,
        kind: 'folder',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        specialKind: 'inbox',
        title: 'Inbox',
        updatedAt: '2026-05-03T00:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

describe('companion capture text actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000010')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000011');
  });

  it('persists captured text as an Inbox topic node version', async () => {
    const { persistCompanionCapturedText } = await import('./companionCaptureTextActions');

    const result = await persistCompanionCapturedText({
      deviceId: 'android-device',
      snapshot: createSnapshot(),
      text: '  Quick note\nsecond line  '
    });

    const node = result.snapshot.nodesById[result.nodeId]!;
    expect(node).toMatchObject({
      content: 'Quick note\nsecond line',
      kind: 'topic',
      parentNodeId: INBOX_NODE_ID,
      title: 'Quick note'
    });
    expect(result.snapshot.nodeOrder).toEqual([INBOX_NODE_ID, result.nodeId]);
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        device_id: 'android-device',
        object_id: result.nodeId,
        version_id: 'android-device#00000000-0000-4000-8000-000000000011'
      })
    ]);
  });

  it('rejects blank captured text before writing a node version', async () => {
    const { persistCompanionCapturedText } = await import('./companionCaptureTextActions');

    await expect(persistCompanionCapturedText({
      deviceId: 'android-device',
      snapshot: createSnapshot(),
      text: '   '
    })).rejects.toMatchObject({ code: 'empty' });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
  });

  it('rejects capture when Inbox is unavailable', async () => {
    const { persistCompanionCapturedText } = await import('./companionCaptureTextActions');
    const snapshot = createSnapshot();
    delete snapshot.nodesById[INBOX_NODE_ID];

    await expect(persistCompanionCapturedText({
      deviceId: 'android-device',
      snapshot,
      text: 'Quick note'
    })).rejects.toMatchObject({ code: 'inbox-unavailable' });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
  });
});
