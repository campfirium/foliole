// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, FRAMED_SYNC_TRANSFER_SEQUENCE_CAPABILITY } from '../../lib/platform/syncProtocolContract.js';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  loadState: vi.fn(),
  post: vi.fn(),
  key: vi.fn(),
  markReady: vi.fn(),
  revokeReady: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  applyDesktopSyncGroupMemberState: mocks.apply,
  isDesktopSyncGroupDeviceBlocked: vi.fn(),
  loadDesktopSyncGroupMemberState: mocks.loadState
}));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadUnreconciledWatchedFolderConflictDecisions: () => []
}));
vi.mock('../import/keepImportMonitor.js', () => ({
  refreshKeepImportMonitorFromSettings: vi.fn()
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({ postDesktopWorkgroupJson: mocks.post }));
vi.mock('./desktopSyncGroupMemberStateReadiness.js', () => ({
  clearDesktopSyncGroupMemberStateReadiness: vi.fn(),
  markDesktopSyncGroupMemberStateReady: mocks.markReady,
  revokeDesktopSyncGroupMemberStateReadiness: mocks.revokeReady
}));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: mocks.key }));

import { acceptDesktopSyncGroupMemberState, exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';

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
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
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
  mocks.key.mockReturnValue({ group_key: 'secret' });
  mocks.loadState.mockReturnValue(memberState());
  mocks.apply.mockReturnValue({
    localExited: false,
    normalSyncReady: false,
    state: { ...memberState(), restore, sender_device_identity_key: sourceDeviceId }
  });
});

it('rejects a missing peer descriptor in an exchange reply before apply and revokes readiness', async () => {
  const incoming = memberState();
  delete incoming.protocol;
  mocks.post.mockResolvedValueOnce(incoming);
  await expect(exchangeDesktopSyncGroupMemberState({
    endpoint_url: 'http://peer', group_id: groupId, local_device_id: sourceDeviceId,
    peer_device_id: receiverDeviceId, peer_device_name: 'Peer', peer_platform: 'android-capacitor'
  })).rejects.toThrow('sync_group_peer_incompatible:protocol_metadata_missing');
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.markReady).not.toHaveBeenCalled();
  expect(mocks.revokeReady).toHaveBeenCalledWith(receiverDeviceId);
  expect(JSON.parse(mocks.post.mock.calls[0]![0].body).protocol).toEqual(CURRENT_SYNC_PROTOCOL_DESCRIPTOR);
});

it('allows the restore source to supply a new member with no restore state', () => {
  acceptDesktopSyncGroupMemberState(JSON.stringify(memberState()), receiverDeviceId);

  expect(mocks.markReady).toHaveBeenCalledWith(receiverDeviceId, 'restore');
  expect(mocks.revokeReady).not.toHaveBeenCalled();
});

it.each(['missing', 'legacy'] as const)('rejects %s protocol before applying or marking ready', kind => {
  const incoming = memberState();
  if (kind === 'missing') delete incoming.protocol;
  else incoming.protocol = { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(value => value !== FRAMED_SYNC_TRANSFER_SEQUENCE_CAPABILITY) };
  expect(() => acceptDesktopSyncGroupMemberState(JSON.stringify(incoming), receiverDeviceId))
    .toThrow('sync_group_peer_incompatible');
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.markReady).not.toHaveBeenCalled();
  expect(mocks.revokeReady).toHaveBeenCalledWith(receiverDeviceId);
});
