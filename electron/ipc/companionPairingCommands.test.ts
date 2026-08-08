// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { handleCompanionPairingCommand } from './companionPairingCommands.js';

const commandMocks = vi.hoisted(() => ({
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
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
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
  loadDesktopSyncGroup: vi.fn(() => null)
}));
vi.mock('../sync/companionPairingRequests.js', () => ({
  approveCompanionPairRequest: vi.fn(),
  loadPendingCompanionPairRequests: vi.fn(() => []),
  rejectCompanionPairRequest: vi.fn()
}));
vi.mock('../sync/companionPairingStore.js', () => ({
  clearPairedCompanionDevices: vi.fn(),
  loadPairedCompanionDevices: vi.fn(() => []),
  removePairedCompanionDevice: vi.fn()
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncEnabled: vi.fn(() => true),
  setDesktopCompanionSyncEnabled: vi.fn()
}));
vi.mock('../sync/desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: commandMocks.loadDesktopSyncGroupJoinState,
  saveDesktopSyncGroupCandidates: vi.fn()
}));
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: vi.fn(),
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
  stopLanWorkspaceSyncServer: vi.fn()
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  loadDesktopPrimaryDeviceStatePayload: commandMocks.loadDesktopPrimaryDeviceStatePayload
}));

beforeEach(() => {
  vi.clearAllMocks();
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
