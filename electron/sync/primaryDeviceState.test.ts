import { beforeEach, expect, it, vi } from 'vitest';

const primaryDeviceMocks = vi.hoisted(() => ({
  loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop'),
  loadCommittedPrimaryDevice: vi.fn(() => null as null | {
    committedAt: string;
    primaryDeviceEpoch: number;
    primaryDeviceId: string;
    updatedByDeviceId: string;
  }),
  loadPairedCompanionDevices: vi.fn(() => [] as Array<{
    client_address: string | null;
    device_id: string;
    device_kind: string;
    device_name: string;
    paired_at: string;
  }>),
  loadSyncPeers: vi.fn(() => [] as Array<{
    last_seen_version_cursor: string | null;
    last_synced_at: string | null;
    peer_id: string;
    status: 'paired' | 'revoked' | 'stale';
    updated_at: string;
  }>)
}));

vi.mock('../database/deviceIdentity.js', () => ({
  loadOrCreateDesktopDeviceId: primaryDeviceMocks.loadOrCreateDesktopDeviceId
}));
vi.mock('../database/primaryDeviceCommit.js', () => ({
  loadCommittedPrimaryDevice: primaryDeviceMocks.loadCommittedPrimaryDevice
}));
vi.mock('../database/syncPeers.js', () => ({
  loadSyncPeers: primaryDeviceMocks.loadSyncPeers
}));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedCompanionDevices: primaryDeviceMocks.loadPairedCompanionDevices
}));

beforeEach(() => {
  vi.clearAllMocks();
  primaryDeviceMocks.loadOrCreateDesktopDeviceId.mockReturnValue('device-desktop');
  primaryDeviceMocks.loadCommittedPrimaryDevice.mockReturnValue(null);
  primaryDeviceMocks.loadPairedCompanionDevices.mockReturnValue([]);
  primaryDeviceMocks.loadSyncPeers.mockReturnValue([]);
});

it('uses committed peer primary state after takeover', async () => {
  primaryDeviceMocks.loadCommittedPrimaryDevice.mockReturnValue({
    committedAt: '2026-05-10T00:05:00.000Z',
    primaryDeviceEpoch: 1,
    primaryDeviceId: 'device-android',
    updatedByDeviceId: 'device-android'
  });
  const { canDesktopRunExternalSources, loadDesktopPrimaryDeviceStatePayload } = await import('./primaryDeviceState.js');

  expect(loadDesktopPrimaryDeviceStatePayload()).toMatchObject({
    local_role: 'secondary',
    primary_device_id: 'device-android',
    source: 'committed-primary-device'
  });
  expect(canDesktopRunExternalSources()).toBe(false);
});

it('loads an unpaired desktop as its own primary device', async () => {
  const { loadDesktopPrimaryDeviceStatePayload } = await import('./primaryDeviceState.js');

  expect(loadDesktopPrimaryDeviceStatePayload('2026-05-10T00:00:00.000Z')).toEqual({
    can_initiate_takeover: false,
    local_role: 'primary',
    primary_device_id: 'device-desktop',
    source: 'self-unpaired',
    takeover_blocked_reasons: []
  });
  expect(primaryDeviceMocks.loadOrCreateDesktopDeviceId).toHaveBeenCalledWith('2026-05-10T00:00:00.000Z');
});

it('uses paired companion trust and sync peers as resolver inputs', async () => {
  primaryDeviceMocks.loadPairedCompanionDevices.mockReturnValue([
    {
      client_address: '192.168.1.22',
      device_id: 'device-android',
      device_kind: 'android',
      device_name: 'Pixel 9',
      paired_at: '2026-05-10T00:00:00.000Z'
    }
  ]);
  primaryDeviceMocks.loadSyncPeers.mockReturnValue([
    {
      last_seen_version_cursor: 'device-desktop#42',
      last_synced_at: '2026-05-10T00:01:00.000Z',
      peer_id: 'device-android',
      status: 'paired',
      updated_at: '2026-05-10T00:01:00.000Z'
    }
  ]);
  const { loadDesktopPrimaryDeviceStatePayload } = await import('./primaryDeviceState.js');

  expect(loadDesktopPrimaryDeviceStatePayload()).toMatchObject({
    local_role: 'primary',
    primary_device_id: 'device-desktop',
    source: 'desktop-paired-default'
  });
});

it('allows external sources only when this desktop resolves as primary', async () => {
  const { canDesktopRunExternalSources, toNativePrimaryDeviceStatePayload } = await import('./primaryDeviceState.js');

  expect(canDesktopRunExternalSources()).toBe(true);
  expect(toNativePrimaryDeviceStatePayload({
    canInitiateTakeover: false,
    localRole: 'secondary',
    primaryDeviceId: 'device-other',
    source: 'committed-primary-device',
    takeoverBlockedReasons: ['release-ack-missing']
  })).toMatchObject({
    local_role: 'secondary',
    takeover_blocked_reasons: ['release-ack-missing']
  });
});
