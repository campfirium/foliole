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
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/sync-pack?after_state_seq=0'
    },
    url: 'http://10.0.2.2:38641/companion/sync-pack?after_state_seq=0'
  });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8);
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

async function testFailsWhenStageNeverReturns() {
  vi.useFakeTimers();
  syncBridgeMock.applyCompanionDesktopSyncPack.mockReturnValue(new Promise(() => undefined));

  const {
    COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS,
    syncCompanionObjectsFromDesktop
  } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  let settled = false;
  sync.finally(() => {
    settled = true;
  }).catch(() => undefined);
  const assertion = expect(sync).rejects.toThrow('Desktop sync timed out while applying the structure pack.');
  await vi.advanceTimersByTimeAsync(COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);

  await assertion;
  vi.useRealTimers();
}

async function testStructureTimeoutStaysBelowMinute() {
  const {
    COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS
  } = await import('./companionDesktopSyncObjects');

  expect(COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS).toBeLessThan(60_000);
}

async function testReportsRemainingStructureLagFromFinalDiagnostics() {
  diagnosticsMock.loadLocalSyncDiagnostics
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
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
  expect(result.remainingStructureChangeCount).toBe(2);
}

describe('companion desktop sync objects', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('pulls the structure pack from desktop', testPullsStructurePack);

  it('does not run legacy JSON state, topic, or review streams on the normal pull path', testNoLegacyJsonStreams);

  it('fails instead of staying in sync when a desktop sync stage never returns', testFailsWhenStageNeverReturns);

  it('keeps structure sync timeout below a minute', testStructureTimeoutStaysBelowMinute);

  it('reports remaining structure lag from final diagnostics', testReportsRemainingStructureLagFromFinalDiagnostics);
});
