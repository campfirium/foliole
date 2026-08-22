import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  diagnosticsMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

async function testPullsStructurePack() {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedPackBlobCount: 2,
    appliedPackObjectCount: 3
  });
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledWith({
    headers: {
      'X-Authorization-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/sync-pack?after_state_seq=0'
    },
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    url: 'http://10.0.2.2:38641/companion/sync-pack?after_state_seq=0'
  });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8, 'desktop-test-device');
}

async function testNoLegacyJsonStreams() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedReviewOpIds: [],
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    syncedAttachmentIds: []
  });
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-state'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-node-versions'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-review-log'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-objects'), expect.any(Object));
}

async function testWaitsForExclusiveStructureApplyAfterTimeout() {
  vi.useFakeTimers();
  const resolvePackRef: {
    current: ((result: { applied_blob_count: number; applied_object_count: number; to_state_seq: number }) => void) | null;
  } = { current: null };
  syncBridgeMock.applyCompanionDesktopSyncPack.mockReturnValue(new Promise((resolve) => {
    resolvePackRef.current = resolve;
  }));

  const {
    COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS,
    syncCompanionObjectsFromDesktop
  } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  let settled = false;
  sync.finally(() => {
    settled = true;
  }).catch(() => undefined);
  await vi.advanceTimersByTimeAsync(COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS);

  expect(settled).toBe(false);
  expect(syncBridgeMock.saveCompanionSyncPackCursor).not.toHaveBeenCalled();
  const resolvePack = resolvePackRef.current;
  if (!resolvePack) {
    throw new Error('Expected sync pack apply promise to be pending');
  }
  resolvePack({
    applied_blob_count: 2,
    applied_object_count: 3,
    to_state_seq: 8
  });
  await expect(sync).resolves.toMatchObject({ appliedPackObjectCount: 3 });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8, 'desktop-test-device');
  vi.useRealTimers();
}

async function testStructureTimeoutStaysBelowMinute() {
  const {
    COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS
  } = await import('./companionDesktopSyncObjects');

  expect(COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS).toBeLessThan(60_000);
}

async function testConfirmsTheAppliedPackSnapshotDespiteLaterDesktopWrites() {
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue({
    content: {
      missing_attachment_resource_bytes: 0,
      missing_attachment_resource_count: 0,
      missing_content_blob_bytes: 0,
      missing_content_blob_count: 0
    },
    sync_state: {
      local_dirty_count: 0,
      pack_cursor: 8,
      pending_ack_count: 0,
      push_issue_count: 0
    }
  });
  diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue({
    sync_state: {
      max_state_seq: 10
    }
  });

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(diagnosticsMock.loadDesktopSyncDiagnostics).toHaveBeenCalledWith('http://10.0.2.2:38641/');
  expect(result.remainingStructureChangeCount).toBe(0);
}

async function testResourceContinuationSkipsStructurePack() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: 'body-hash', size_bytes: 1024 }])
    .mockResolvedValue([]);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { resourcesOnly: true });

  expect(result).toMatchObject({
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    pushError: null,
    syncedContentBlobHashes: ['body-hash']
  });
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).not.toHaveBeenCalled();
  expect(syncBridgeMock.saveCompanionSyncPackCursor).not.toHaveBeenCalled();
}

async function testResourceContinuationDetectsLaterDesktopWrites() {
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue({
    content: { missing_attachment_resource_count: 0, missing_content_blob_count: 0 },
    sync_state: { local_dirty_count: 0, pack_cursor: 8, pending_ack_count: 0, push_issue_count: 0 }
  });
  diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue({ sync_state: { max_state_seq: 10 } });

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop(
    'http://10.0.2.2:38641/', { resourcesOnly: true }
  );

  expect(result.remainingStructureChangeCount).toBe(2);
}

async function testRejectedLegacyPackKeepsCursorForUpgradedRetry() {
  syncBridgeMock.applyCompanionDesktopSyncPack
    .mockRejectedValueOnce(new Error('unsupported_sync_pack_format_version'))
    .mockResolvedValueOnce({
      applied_blob_count: 2,
      applied_object_count: 3,
      to_state_seq: 8
    });
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/'))
    .rejects.toThrow('unsupported_sync_pack_format_version');
  expect(syncBridgeMock.saveCompanionSyncPackCursor).not.toHaveBeenCalled();

  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/'))
    .resolves.toMatchObject({ appliedPackObjectCount: 3 });
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenNthCalledWith(2,
    expect.objectContaining({
      url: 'http://10.0.2.2:38641/companion/sync-pack?after_state_seq=0'
    }));
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledOnce();
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8, 'desktop-test-device');
}

describe('companion desktop sync objects', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('pulls the structure pack from desktop', testPullsStructurePack);

  it('does not run legacy JSON state, topic, or review streams on the normal pull path', testNoLegacyJsonStreams);

  it('waits for exclusive structure apply work instead of racing failure writes', testWaitsForExclusiveStructureApplyAfterTimeout);

  it('keeps structure sync timeout below a minute', testStructureTimeoutStaysBelowMinute);

  it('confirms the applied pack snapshot despite later desktop writes',
    testConfirmsTheAppliedPackSnapshotDespiteLaterDesktopWrites);

  it('skips structure pack work during resource-only continuation', testResourceContinuationSkipsStructurePack);

  it('detects later desktop writes during resource-only continuation',
    testResourceContinuationDetectsLaterDesktopWrites);

  it('keeps the original cursor when a legacy pack is rejected and converges after upgrade',
    testRejectedLegacyPackKeepsCursorForUpgradedRetry);
});
