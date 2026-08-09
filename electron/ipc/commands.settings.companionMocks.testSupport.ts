import { vi } from 'vitest';

const { loadSyncPeers, saveSyncPeers } = vi.hoisted(() => ({
  loadSyncPeers: vi.fn().mockReturnValue([
    {
      peer_id: 'android-1',
      status: 'paired',
      last_synced_at: '2026-04-21T16:30:00.000Z',
      last_seen_version_cursor: 'desktop-1#42',
      updated_at: '2026-04-21T16:30:00.000Z'
    }
  ]),
  saveSyncPeers: vi.fn().mockImplementation((peers: Array<Record<string, unknown>>) =>
    peers.map((peer) => ({
      ...peer,
      updated_at: '2026-04-21T16:35:00.000Z'
    }))
  )
}));

const companionPairingMocks = vi.hoisted(() => ({
  approveCompanionPairRequest: vi.fn().mockImplementation((pairRequestId: string) =>
    pairRequestId === 'pair-request-1'
      ? {
          device_id: 'android-1',
          device_kind: 'android',
          device_name: 'Pixel 9',
          expires_at: '2026-04-24T10:02:00.000Z',
          pair_request_id: 'pair-request-1',
          requested_at: '2026-04-24T10:00:00.000Z',
          status: 'approved'
        }
      : null
  ),
  loadPendingCompanionPairRequests: vi.fn().mockReturnValue([
    {
      device_id: 'android-1',
      device_kind: 'android',
      device_name: 'Pixel 9',
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      requested_at: '2026-04-24T10:00:00.000Z',
      status: 'pending'
    }
  ]),
  loadPairedCompanionDevices: vi.fn().mockReturnValue([
    {
      client_address: '192.168.1.22',
      device_id: 'android-1',
      device_kind: 'android',
      device_name: 'Pixel 9',
      paired_at: '2026-04-24T10:03:00.000Z'
    }
  ]),
  clearPairedCompanionDevices: vi.fn(),
  removePairedCompanionDevice: vi.fn(),
  rejectCompanionPairRequest: vi.fn().mockImplementation((pairRequestId: string) =>
    pairRequestId === 'pair-request-1'
      ? {
          device_id: 'android-1',
          device_kind: 'android',
          device_name: 'Pixel 9',
          expires_at: '2026-04-24T10:02:00.000Z',
          pair_request_id: 'pair-request-1',
          requested_at: '2026-04-24T10:00:00.000Z',
          status: 'rejected'
        }
      : null
  )
}));

vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop') }));
vi.mock('../database/syncGroupStore.js', () => ({
  createDesktopSyncGroup: vi.fn(),
  loadDesktopSyncGroup: vi.fn().mockReturnValue(null)
}));
vi.mock('../database/syncPeers.js', () => ({ loadSyncPeers, saveSyncPeers }));
vi.mock('../sync/companionPairingRequests.js', () => companionPairingMocks);
vi.mock('../sync/companionPairingStore.js', () => ({
  clearPairedCompanionDevices: companionPairingMocks.clearPairedCompanionDevices,
  loadPairedCompanionDevices: companionPairingMocks.loadPairedCompanionDevices,
  removePairedCompanionDevice: companionPairingMocks.removePairedCompanionDevice
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncEnabled: vi.fn().mockReturnValue(true),
  setDesktopCompanionSyncEnabled: vi.fn()
}));
