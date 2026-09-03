import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';

const device = vi.hoisted(() => ({
  failWrite: false,
  snapshot: null as WorkspaceSnapshot | null
}));

const nativeWrites = vi.hoisted(() => ({
  apply: vi.fn(async (records: NativeSyncNodeRecord[]) => {
    if (device.failWrite) throw new Error('native write failed');
    for (const record of records) appendDeviceNode(record);
    return records.map((record) => record.object_id);
  }),
  saveReview: vi.fn(async ({ nodeId, review }) => {
    const snapshot = device.snapshot!;
    device.snapshot = {
      ...snapshot,
      nodesById: {
        ...snapshot.nodesById,
        [nodeId]: { ...snapshot.nodesById[nodeId]!, review }
      }
    };
    return { object_id: nodeId };
  })
}));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: vi.fn(async () => ({
    endpoint_url: null,
    last_synced_at: null,
    remembered_targets: [],
    sync_events: [],
    sync_onboarding_status: 'accepted',
    workspace_snapshot: device.snapshot
  }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => ({
  applyCompanionSyncNodeVersions: vi.fn(),
  applyCompanionSyncNodeVersionsWithinWriterTask: nativeWrites.apply,
  saveCompanionSyncNodeReviewRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecordWithinWriterTask: nativeWrites.saveReview
}));

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'parent',
    nodeOrder: ['parent'],
    nodesById: {
      parent: {
        anchorLink: null,
        content: 'Alpha Beta Gamma',
        createdAt: '2026-08-04T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'parent',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Parent',
        updatedAt: '2026-08-04T00:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function appendDeviceNode(record: NativeSyncNodeRecord) {
  const snapshot = device.snapshot!;
  const native = record.snapshot;
  device.snapshot = {
    ...snapshot,
    nodeOrder: [...snapshot.nodeOrder, record.object_id],
    nodesById: {
      ...snapshot.nodesById,
      [record.object_id]: {
        anchorLink: native.anchor_link ? JSON.parse(native.anchor_link) : null,
        content: native.content ?? record.body_text ?? '',
        createdAt: native.created_at,
        ...(record.version_id ? { currentVersionId: record.version_id } : {}),
        hideTitleHeading: native.hide_title_heading,
        id: record.object_id,
        imageRegions: native.image_regions ? JSON.parse(native.image_regions) : null,
        isTitleManual: native.is_title_manual,
        kind: native.kind === 'item' ? 'item' : 'topic',
        openingText: native.opening_text,
        parentNodeId: native.parent_id,
        reading: null,
        reveal: native.reveal,
        review: null,
        title: native.title,
        updatedAt: native.updated_at
      }
    }
  };
}

function createPayload(anchorId: string) {
  return {
    anchorId,
    clozeContent: 'Alpha [...] Gamma',
    entries: [{ locator: { from: 6, originalText: 'Beta', to: 10 } }],
    parentNodeId: 'parent',
    selectionText: 'Beta'
  };
}

beforeEach(() => {
  device.failWrite = false;
  device.snapshot = createSnapshot();
  vi.clearAllMocks();
});

it('serializes unawaited native note, cloze, and highlight mutations against device truth', async () => {
  const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');
  const staleSnapshot = device.snapshot;

  const results = await Promise.all([
    persistCompanionSelectionAnnotation({
      deviceId: 'android-device', kind: 'note', note: 'Remember this', payload: createPayload('note'), snapshot: staleSnapshot
    }),
    persistCompanionSelectionAnnotation({
      deviceId: 'android-device', kind: 'cloze', payload: createPayload('cloze'), snapshot: staleSnapshot
    }),
    persistCompanionSelectionAnnotation({
      deviceId: 'android-device', kind: 'highlight', payload: createPayload('highlight'), snapshot: staleSnapshot
    })
  ]);

  const nodeIds = results.map((result) => result?.nodeId);
  expect(nodeIds).not.toContain(undefined);
  expect(device.snapshot?.nodeOrder).toEqual(['parent', ...nodeIds]);
  expect(results[2]?.snapshot.nodeOrder).toEqual(['parent', ...nodeIds]);
  expect(device.snapshot?.nodesById[nodeIds[1]!]!.review).not.toBeNull();
  expect(nativeWrites.apply).toHaveBeenCalledTimes(3);
});

it('propagates a native annotation write failure without publishing a snapshot result', async () => {
  device.failWrite = true;
  const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');

  await expect(persistCompanionSelectionAnnotation({
    deviceId: 'android-device', kind: 'highlight', payload: createPayload('highlight'), snapshot: device.snapshot
  })).rejects.toThrow('native write failed');
  expect(device.snapshot?.nodeOrder).toEqual(['parent']);
});
