// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { handleCompanionPairingCommand } from './companionPairingCommands.js';

const commandMocks = vi.hoisted(() => ({
  completeDesktopSyncGroupJoin: vi.fn(async () => {
    commandMocks.joined = true;
    return { group_id: 'group-1' };
  }),
  loadDesktopSyncGroupJoinState: vi.fn(() => ({
    candidates: [{
      endpoint_url: 'http://192.168.0.107:39339',
      group_display_name: 'Foliole Desktop on Maci.local',
      group_id: 'group-1',
      provider_authorization_id: 'authorization-android-b',
      provider_host_name: 'Xiaomi 23049RAD8C',
      provider_host_platform: 'android-capacitor',
      timeline_id: 'timeline-1'
    }],
    pending: null
  })),
  requestDesktopSyncGroupJoin: vi.fn().mockResolvedValue(undefined),
  removeDesktopSyncGroupMember: vi.fn().mockResolvedValue(undefined),
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
vi.mock('../database/hostProfile.js', () => ({
  loadOrCreateDesktopHostName: vi.fn(() => 'Desktop')
}));
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: commandMocks.runWithDatabaseConnectionOwner
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
  loadPairedCompanionAuthorizations: vi.fn(() => [])
}));
vi.mock('../sync/syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: vi.fn(() => 'runtime-authorization')
}));
vi.mock('../sync/companionLanPayloads.js', () => ({
  resolveDesktopHostName: vi.fn(() => 'Desktop')
}));
vi.mock('../sync/desktopSyncGroupDiscovery.js', () => ({
  discoverDesktopSyncGroups: vi.fn(async () => [])
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  loadDesktopCompanionSyncParticipation: vi.fn(() => ({
    lifecycle_active: true, participating: commandMocks.enabled && !commandMocks.paused,
    sync_enabled: commandMocks.enabled, sync_paused: commandMocks.paused
  })),
}));
vi.mock('../sync/desktopCompanionSyncParticipation.js', () => ({
  activateDesktopCompanionSync: vi.fn(async () => {
    commandMocks.enabled = true; commandMocks.paused = false;
  }),
  assertDesktopCompanionSyncParticipating: vi.fn(() => {
    if (!commandMocks.enabled || commandMocks.paused) throw new Error('sync_participation_inactive');
  }),
  disableDesktopCompanionSync: vi.fn(async () => { commandMocks.enabled = false; }),
  enableDesktopCompanionSync: vi.fn(async () => { commandMocks.enabled = true; }),
  pauseDesktopCompanionSync: vi.fn(async () => { commandMocks.paused = true; }),
  resumeDesktopCompanionSync: vi.fn(async () => { commandMocks.paused = false; })
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
vi.mock('../sync/syncGroupDeparture.js', () => ({
  leaveDesktopSyncGroup: vi.fn().mockResolvedValue(undefined),
  removeDesktopSyncGroupMember: commandMocks.removeDesktopSyncGroupMember
}));
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: commandMocks.ensureLanWorkspaceSyncServer,
  getLanWorkspaceSyncServerStatus: vi.fn(() => ({
    advertised_urls: [],
    last_error: null,
    paired_authorization_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  })),
  refreshLanWorkspaceSyncServerPairingStatus: vi.fn(() => ({
    advertised_urls: [],
    last_error: null,
    paired_authorization_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  })),
  stopLanWorkspaceSyncServer: commandMocks.stopLanWorkspaceSyncServer
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

it('keeps discovered Sync Group candidates in the polling overview', async () => {
  await expect(handleCompanionPairingCommand('load_companion_pairing_overview', {})).resolves.toMatchObject({
    join_candidates: [expect.objectContaining({
      group_display_name: 'Foliole Desktop on Maci.local',
      group_id: 'group-1'
    })],
    join_request: null
  });
});

it('removes a member through its Host name without a Device-shaped command field', async () => {
  await handleCompanionPairingCommand('remove_sync_group_member', { host_name: 'Reading Phone' });
  expect(commandMocks.removeDesktopSyncGroupMember).toHaveBeenCalledWith('Reading Phone');
  await expect(handleCompanionPairingCommand(
    'remove_sync_group_member', { device_id: 'Reading Phone' }
  )).rejects.toThrow('host_name');
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
  expect(commandMocks.runWithDatabaseConnectionOwner).toHaveBeenCalledTimes(2);
});
