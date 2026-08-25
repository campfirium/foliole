import { beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  registerAuthorization: vi.fn(),
  requestJson: vi.fn(),
  savePeer: vi.fn((peer) => peer),
  savePending: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { queryOne: vi.fn() } })
}));
vi.mock('../database/syncGroupStore.js', () => ({
  joinDesktopSyncGroup: vi.fn(), loadDesktopSyncGroup: vi.fn(() => null)
}));
vi.mock('./companionLanPayloads.js', () => ({ resolveDesktopHostName: () => 'Windows C' }));
vi.mock('./companionMdnsAdvertisement.js', () => ({ refreshCompanionMdnsAdvertisement: vi.fn() }));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedSyncGroupPeers: vi.fn(() => []),
  registerPairedCompanionAuthorizationWithSecret: runtime.registerAuthorization,
  savePairedSyncGroupPeer: runtime.savePeer
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn(), requestJson: runtime.requestJson
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: () => ({ pending: {
    candidate: { endpoint_url: 'http://android-b:38641', group_id: 'group-1',
      timeline_id: 'timeline-1' },
    key: { privateKey: 'private' },
    request: { pair_request_id: 'request-c' }
  } }),
  saveDesktopSyncGroupPendingJoin: runtime.savePending
}));
vi.mock('./desktopSyncGroupPackApply.js', () => ({
  downloadAndApplyDesktopSyncGroupPack: vi.fn()
}));
vi.mock('./desktopSyncGroupPairingCrypto.js', () => ({
  decryptDesktopSyncGroupPairingSecret: vi.fn(async () => 'group-key')
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: vi.fn()
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  assertDesktopSyncGroupResourcesComplete: vi.fn(), downloadDesktopSyncGroupResources: vi.fn()
}));
vi.mock('./workgroupKeyStore.js', () => ({ saveDesktopWorkgroupKey: vi.fn() }));

import { completeDesktopSyncGroupJoin } from './desktopSyncGroupJoin.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.requestJson.mockResolvedValue({
    authorization_id: 'authorization-c',
    compatibility: { negotiated_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version },
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    encrypted_credential_secret: { ciphertext: 'member' }, host_name: 'Windows C',
    provider_authorization_id: 'authorization-b',
    provider_encrypted_credential_secret: { ciphertext: 'provider' },
    provider_host_name: 'Android B', provider_host_platform: 'android-capacitor',
    sync_group: { group_id: 'group-1', local_host_name: 'Windows C',
      local_member_state: 'active', members: [], timeline_id: 'timeline-1' }
  });
});

it('persists the admitting member authorization before exposing the joined provider', async () => {
  await completeDesktopSyncGroupJoin();

  expect(runtime.registerAuthorization).toHaveBeenCalledWith({
    authorizationId: 'authorization-b', credentialSecret: 'group-key',
    hostName: 'Android B', hostPlatform: 'android-capacitor',
    negotiatedProtocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
  expect(runtime.registerAuthorization.mock.invocationCallOrder[0])
    .toBeLessThan(runtime.savePeer.mock.invocationCallOrder[0]!);
  expect(runtime.savePending).toHaveBeenCalledWith(null);
});

it('does not persist a provider authorization without the current negotiated protocol', async () => {
  runtime.requestJson.mockResolvedValueOnce({
    ...(await runtime.requestJson()), compatibility: { negotiated_version: null }
  });

  await expect(completeDesktopSyncGroupJoin()).rejects.toThrow('sync_protocol_incompatible');
  expect(runtime.registerAuthorization).not.toHaveBeenCalled();
  expect(runtime.savePeer).not.toHaveBeenCalled();
});
