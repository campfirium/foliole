// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { handleCompanionPairingCommand } from './companionPairingCommands.js';

const commandMocks = vi.hoisted(() => ({
  completeDesktopSyncGroupJoin: vi.fn(async () => {
    commandMocks.joined = true;
    return { group_id: 'group-1' };
  }),
  commitPrimaryDeviceToPeer: vi.fn().mockReturnValue({
    committedAt: '2026-04-24T10:05:00.000Z',
    primaryDeviceEpoch: 2,
    primaryDeviceId: 'device-desktop',
    updatedByDeviceId: 'device-desktop'
  }),
  loadDesktopPrimaryDeviceStatePayload: vi.fn().mockReturnValue({
    can_initiate_takeover: false,
    local_role: 'primary',
    primary_device_id: 'device-desktop',
    source: 'committed-primary-device',
    takeover_blocked_reasons: []
  }),
  loadDesktopSyncGroupJoinState: vi.fn(() => ({
    candidates: [{
      endpoint_url: 'http://192.168.0.107:39339',
      group_display_name: 'Foliole Desktop on Maci.local',
      group_id: 'group-1',
      provider_device_id: 'android-b',
      provider_device_kind: 'android-capacitor',
      provider_device_name: 'Xiaomi 23049RAD8C',
      timeline_id: 'timeline-1'
    }],
    pending: null
  })),
  requestDesktopSyncGroupJoin: vi.fn().mockResolvedValue(undefined),
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute()),
  setDesktopCompanionSyncEnabled: vi.fn(),
  setDesktopCompanionSyncPaused: vi.fn(),
  setJoinCompletionExecutor: vi.fn(),
  ensureLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined),
  enableDesktopWorkgroupKey: vi.fn(),
  enabled: true,
  joined: false,
  paused: false,
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' }
}));
vi.mock('../database/deviceIdentity.js', () => ({
  loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop')
}));
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: commandMocks.runWithDatabaseConnectionOwner
}));
vi.mock('../database/primaryDeviceCommit.js', () => ({
  commitPrimaryDeviceToPeer: commandMocks.commitPrimaryDeviceToPeer
}));
vi.mock('../database/syncGroupStore.js', () => ({
  createDesktopSyncGroup: vi.fn(),
  loadDesktopSyncGroup: vi.fn(() => commandMocks.joined ? {
    group_id: 'group-1', local_member_state: 'active', members: []
  } : null)
}));
vi.mock('../sync/companionPairingRequests.js', () => ({
  approveCompanionPairRequest: vi.fn(),
  loadPendingCompanionPairRequests: vi.fn(() => []),
  rejectCompanionPairRequest: vi.fn()
}));
vi.mock('../sync/companionPairingStore.js', () => ({
  clearPairedCompanionDevices: vi.fn(),
  loadPairedCompanionDevices: vi.fn(() => []),
  migratePairedCompanionStore: vi.fn(() => ({ migrated: false })),
  removePairedCompanionDevice: vi.fn()
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncEnabled: vi.fn(() => true),
  isDesktopCompanionSyncParticipating: vi.fn(() => commandMocks.enabled && !commandMocks.paused),
  loadDesktopCompanionSyncParticipation: vi.fn(() => ({
    lifecycle_active: true, participating: commandMocks.enabled && !commandMocks.paused,
    sync_enabled: commandMocks.enabled, sync_paused: commandMocks.paused
  })),
  setDesktopCompanionSyncEnabled: commandMocks.setDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncPaused: commandMocks.setDesktopCompanionSyncPaused
}));
vi.mock('../sync/desktopSyncGroupJoin.js', () => ({
  completeDesktopSyncGroupJoin: commandMocks.completeDesktopSyncGroupJoin,
  requestDesktopSyncGroupJoin: commandMocks.requestDesktopSyncGroupJoin,
  setDesktopSyncGroupJoinCompletionExecutor: commandMocks.setJoinCompletionExecutor
}));
vi.mock('../sync/desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: commandMocks.loadDesktopSyncGroupJoinState,
  saveDesktopSyncGroupCandidates: vi.fn()
}));
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: commandMocks.ensureLanWorkspaceSyncServer,
  getLanWorkspaceSyncServerStatus: vi.fn(() => ({
    advertised_urls: [],
    last_error: null,
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  })),
  refreshLanWorkspaceSyncServerPairingStatus: vi.fn(() => ({
    advertised_urls: [],
    last_error: null,
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  })),
  stopLanWorkspaceSyncServer: commandMocks.stopLanWorkspaceSyncServer
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  loadDesktopPrimaryDeviceStatePayload: commandMocks.loadDesktopPrimaryDeviceStatePayload
}));
vi.mock('../sync/workgroupKeyStore.js', () => ({
  enableDesktopWorkgroupKey: commandMocks.enableDesktopWorkgroupKey,
  loadDesktopWorkgroupKey: vi.fn(() => ({ group_id: 'group-1' }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  commandMocks.enabled = true;
  commandMocks.joined = false;
  commandMocks.paused = false;
  commandMocks.setDesktopCompanionSyncEnabled.mockImplementation((enabled: boolean) => {
    commandMocks.enabled = enabled;
  });
  commandMocks.setDesktopCompanionSyncPaused.mockImplementation((paused: boolean) => {
    commandMocks.paused = paused;
  });
});

it('keeps desktop Sync and Pause as independent commands', async () => {
  await expect(handleCompanionPairingCommand('pause_companion_sync', {})).resolves.toMatchObject({
    participating: false, sync_enabled: true, sync_paused: true
  });
  await expect(handleCompanionPairingCommand('disable_companion_sync', {})).resolves.toMatchObject({
    participating: false, sync_enabled: false, sync_paused: true
  });
  await expect(handleCompanionPairingCommand('resume_companion_sync', {})).resolves.toMatchObject({
    participating: false, sync_enabled: false, sync_paused: false
  });
  expect(commandMocks.ensureLanWorkspaceSyncServer).not.toHaveBeenCalled();
});

it('rejects discovery while local participation is inactive', async () => {
  commandMocks.enabled = false;
  await expect(handleCompanionPairingCommand('discover_sync_groups', {}))
    .rejects.toThrow('sync_participation_inactive');
});

it('commits the desktop device as primary through the coordinated database owner', async () => {
  await expect(handleCompanionPairingCommand('set_desktop_as_primary_device', {})).resolves.toMatchObject({
    primary_device_state: {
      local_role: 'primary',
      primary_device_id: 'device-desktop'
    }
  });
  expect(commandMocks.commitPrimaryDeviceToPeer).toHaveBeenCalledWith({
    primaryDeviceId: 'device-desktop',
    updatedByDeviceId: 'device-desktop'
  });
  expect(commandMocks.runWithDatabaseConnectionOwner).toHaveBeenCalledOnce();
});

it('keeps discovered Sync Group candidates in the polling overview', async () => {
  await expect(handleCompanionPairingCommand('load_companion_pairing_overview', {})).resolves.toMatchObject({
    join_candidates: [expect.objectContaining({
      group_display_name: 'Foliole Desktop on Maci.local',
      group_id: 'group-1'
    })],
    join_request: null
  });
});

it('finishes an approved join inside the database owner and enables automatic continuation', async () => {
  await handleCompanionPairingCommand('request_sync_group_join', {
    endpoint_url: 'http://192.168.0.107:39339'
  });
  expect(commandMocks.requestDesktopSyncGroupJoin).toHaveBeenCalledWith('http://192.168.0.107:39339');
  const execute = commandMocks.setJoinCompletionExecutor.mock.calls[0]?.[0];
  expect(execute).toBeTypeOf('function');
  await execute();
  expect(commandMocks.completeDesktopSyncGroupJoin).toHaveBeenCalledOnce();
  expect(commandMocks.enableDesktopWorkgroupKey).toHaveBeenCalledWith('group-1');
  expect(commandMocks.setDesktopCompanionSyncEnabled).toHaveBeenCalledWith(true);
  expect(commandMocks.setDesktopCompanionSyncPaused).toHaveBeenCalledWith(false);
  expect(commandMocks.ensureLanWorkspaceSyncServer).toHaveBeenCalledOnce();
  expect(commandMocks.runWithDatabaseConnectionOwner).toHaveBeenCalledTimes(2);
});
