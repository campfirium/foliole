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
  })
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' }
}));
vi.mock('../database/deviceIdentity.js', () => ({
  loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop')
}));
vi.mock('../database/primaryDeviceCommit.js', () => ({
  commitPrimaryDeviceToPeer: commandMocks.commitPrimaryDeviceToPeer
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

it('commits the desktop device as primary through the existing primary-device model', () => {
  expect(handleCompanionPairingCommand('set_desktop_as_primary_device', {})).toMatchObject({
    primary_device_state: {
      local_role: 'primary',
      primary_device_id: 'device-desktop'
    }
  });
  expect(commandMocks.commitPrimaryDeviceToPeer).toHaveBeenCalledWith({
    primaryDeviceId: 'device-desktop',
    updatedByDeviceId: 'device-desktop'
  });
});
