// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  markReady: vi.fn(),
  revokeReady: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  applyDesktopSyncGroupMemberState: mocks.apply,
  isDesktopSyncGroupDeviceBlocked: vi.fn(),
  loadDesktopSyncGroupMemberState: vi.fn()
}));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadUnreconciledWatchedFolderConflictDecisions: () => []
}));
vi.mock('../import/keepImportMonitor.js', () => ({
  refreshKeepImportMonitorFromSettings: vi.fn()
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({ postDesktopWorkgroupJson: vi.fn() }));
vi.mock('./desktopSyncGroupMemberStateReadiness.js', () => ({
  clearDesktopSyncGroupMemberStateReadiness: vi.fn(),
  markDesktopSyncGroupMemberStateReady: mocks.markReady,
  revokeDesktopSyncGroupMemberStateReadiness: mocks.revokeReady
}));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: vi.fn() }));

import { acceptDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';

const groupId = 'group-test';
const sourceDeviceId = 'mac-source';
const receiverDeviceId = 'android-receiver';
const restore = {
  applied: true,
  event: {
    group_id: groupId,
    restore_id: 'restore-test',
    restored_at: '2026-10-06T00:00:00.000Z',
    source_device_identity_key: sourceDeviceId
  }
};

function memberState(): SyncGroupMemberStatePayload {
  return {
    contract_version: 3,
    devices: [],
    group_id: groupId,
    library_epoch: 'receiver-epoch',
    proof_revision: 0,
    source_proof_revisions: {},
    removals: [],
    restore: null,
    sender_device_identity_key: receiverDeviceId
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockReturnValue({
    localExited: false,
    normalSyncReady: false,
    state: { ...memberState(), restore, sender_device_identity_key: sourceDeviceId }
  });
});

it('allows the restore source to supply a new member with no restore state', () => {
  acceptDesktopSyncGroupMemberState(JSON.stringify(memberState()), receiverDeviceId);

  expect(mocks.markReady).toHaveBeenCalledWith(receiverDeviceId, 'restore');
  expect(mocks.revokeReady).not.toHaveBeenCalled();
});
