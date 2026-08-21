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
          host_name: 'Pixel 9',
          host_platform: 'android',
          expires_at: '2026-04-24T10:02:00.000Z',
          pair_request_id: 'pair-request-1',
          requested_at: '2026-04-24T10:00:00.000Z',
          status: 'approved'
        }
      : null
  ),
  loadPendingCompanionPairRequests: vi.fn().mockReturnValue([
    {
      host_name: 'Pixel 9',
      host_platform: 'android',
      expires_at: '2026-04-24T10:02:00.000Z',
      pair_request_id: 'pair-request-1',
      requested_at: '2026-04-24T10:00:00.000Z',
      status: 'pending'
    }
  ]),
  loadPairedCompanionAuthorizations: vi.fn().mockReturnValue([
    {
      authorization_id: 'authorization-android-1',
      client_address: '192.168.1.22',
      host_name: 'Pixel 9',
      host_platform: 'android',
      paired_at: '2026-04-24T10:03:00.000Z'
    }
  ]),
  rejectCompanionPairRequest: vi.fn().mockImplementation((pairRequestId: string) =>
    pairRequestId === 'pair-request-1'
      ? {
          host_name: 'Pixel 9',
          host_platform: 'android',
          expires_at: '2026-04-24T10:02:00.000Z',
          pair_request_id: 'pair-request-1',
          requested_at: '2026-04-24T10:00:00.000Z',
          status: 'rejected'
        }
      : null
  )
}));

vi.mock('../database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: vi.fn(() => 'Desktop') }));
vi.mock('../database/syncGroupStore.js', () => ({
  createDesktopSyncGroup: vi.fn(),
  loadDesktopSyncGroup: vi.fn().mockReturnValue(null)
}));
vi.mock('../database/syncPeers.js', () => ({ loadSyncPeers, saveSyncPeers }));
vi.mock('../sync/companionPairingRequests.js', () => companionPairingMocks);
vi.mock('../sync/companionPairingStore.js', () => ({
  loadPairedCompanionAuthorizations: companionPairingMocks.loadPairedCompanionAuthorizations
}));
vi.mock('../sync/companionPairingStoreCutover.js', () => ({
  ensureCompanionPairingStoreAuthorizationCutover: vi.fn()
}));
vi.mock('../sync/companionLanPayloads.js', () => ({
  resolveDesktopHostName: vi.fn(() => 'Desktop')
}));
vi.mock('../sync/syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: vi.fn(() => 'runtime-authorization')
}));
vi.mock('../sync/desktopCompanionSyncParticipation.js', () => ({
  activateDesktopCompanionSync: vi.fn(async () => undefined),
  assertDesktopCompanionSyncParticipating: vi.fn(),
  disableDesktopCompanionSync: vi.fn(async () => undefined),
  enableDesktopCompanionSync: vi.fn(async () => undefined),
  pauseDesktopCompanionSync: vi.fn(async () => undefined),
  resumeDesktopCompanionSync: vi.fn(async () => undefined)
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  loadDesktopCompanionSyncParticipation: vi.fn().mockReturnValue({
    lifecycle_active: true,
    participating: true,
    sync_enabled: true,
    sync_paused: false
  })
}));
