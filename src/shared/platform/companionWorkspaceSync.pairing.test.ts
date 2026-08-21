import { beforeEach, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const syncGroupMock = vi.hoisted(() => ({
  facts: vi.fn(), join: vi.fn(), load: vi.fn(), loadKey: vi.fn(), refresh: vi.fn()
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    bindSyncGroupPeerRoute: vi.fn(),
    desktopHttpRequest: vi.fn(),
    loadPairingState: vi.fn(),
    savePairingCredentials: vi.fn(),
    signCompanionSyncRequest: vi.fn()
  }
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

vi.mock('./companionPairingEncryption', () => ({
  createCompanionPairingPublicKey: vi.fn(async () => 'client-public-key'),
  decryptCompanionPairingSecret: vi.fn(async () => 'test-secret'),
  dropCompanionPairingPrivateKey: vi.fn()
}));

vi.mock('./companion/sync/syncGroupStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/sync/syncGroupStore')>(),
  joinCompanionSyncGroup: syncGroupMock.join,
  loadCompanionSyncGroup: syncGroupMock.load,
  loadCompanionSyncGroupLibraryFacts: syncGroupMock.facts,
  loadCompanionSyncGroupWorkgroupKey: syncGroupMock.loadKey,
  refreshActiveCompanionSyncGroupMembership: syncGroupMock.refresh
}));

import {
  pairCompanionWithDesktop,
  requestCompanionPairing
} from './companionWorkspaceSync';
import { resetCompanionWorkspaceSyncTestState } from './companionWorkspaceSync.testSupport';

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};
const compatibility = {
  missing_capabilities: [],
  negotiated_version: 1,
  reason: null,
  status: 'compatible'
};
const nativeProtocolState = {
  negotiated_protocol_version: 1,
  remote_protocol: protocol,
  sync_usable: true
};

function createEncryptedSecretFixture() {
  return {
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM' as const,
    ciphertext: 'ciphertext',
    iv: 'iv',
    salt: 'salt',
    server_public_key: 'server-public-key'
  };
}

function mockNativePairingHttp(authorizationId = 'authorization-android', hostName = 'Pixel 9') {
  capacitorMock.plugin.desktopHttpRequest
    .mockResolvedValueOnce({
      body: JSON.stringify({
        compatibility,
        desktop_protocol: protocol,
        expires_at: '2026-04-22T12:02:00.000Z',
        pair_request_id: 'pair-request-1',
        status: 'pending'
      }),
      status: 202
    })
    .mockResolvedValueOnce({
      body: JSON.stringify({
        compatibility,
        desktop_protocol: protocol,
        authorization_id: authorizationId,
        encrypted_credential_secret: createEncryptedSecretFixture(),
        host_name: hostName,
        host_platform: 'android-capacitor',
        paired_at: '2026-04-22T12:00:00.000Z',
        peer_id: 'device-desktop'
      }),
      status: 200
    });
}

function mockVerifiedNativePairing(args: {
  authorizationId: string; hostName: string; hostPlatform: string; platform: string;
}) {
  const queueEvents: string[] = [];
  capacitorMock.getPlatform.mockReturnValue(args.platform);
  capacitorMock.isNativePlatform.mockReturnValue(true);
  writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => {
    queueEvents.push('start');
    const result = await task();
    queueEvents.push('end');
    return result;
  });
  mockNativePairingHttp(args.authorizationId, args.hostName);
  const pairing = {
    ...nativeProtocolState,
    authorization_id: args.authorizationId,
    host_name: args.hostName,
    host_platform: args.hostPlatform,
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z',
  };
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue(pairing);
  capacitorMock.plugin.loadPairingState.mockResolvedValue(pairing);
  capacitorMock.plugin.signCompanionSyncRequest.mockImplementation(async () => {
    queueEvents.push('sign');
    return { headers: {
      'X-Authorization-Id': args.authorizationId,
      'X-Nonce': 'nonce',
      'X-Signature': 'signed',
      'X-Timestamp': '2026-04-22T12:00:00.000Z'
    } };
  });
  return queueEvents;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCompanionWorkspaceSyncTestState(capacitorMock);
  syncGroupMock.facts.mockResolvedValue({
    attachment_count: 0, content_blob_count: 0, node_count: 0,
    review_log_count: 0, timeline_id: 'timeline-1'
  });
  syncGroupMock.load.mockResolvedValue(null);
  syncGroupMock.loadKey.mockResolvedValue(null);
  writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
});

it.each([
  { authorizationId: 'authorization-android', hostName: 'Pixel 9', hostPlatform: 'android', platform: 'android' },
  { authorizationId: 'authorization-ios', hostName: 'iPhone', hostPlatform: 'ios-capacitor', platform: 'ios' }
])('verifies $platform native pairing credentials after saving', async (fixture) => {
  const queueEvents = mockVerifiedNativePairing(fixture);

  await requestCompanionPairing({
    hostName: fixture.hostName,
    hostPlatform: fixture.hostPlatform,
    endpointUrl: 'http://10.0.2.2:38641'
  });
  await expect(pairCompanionWithDesktop({
    hostName: fixture.hostName,
    hostPlatform: fixture.hostPlatform,
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1',
    remotePeerId: 'stale-discovery-peer'
  })).resolves.toMatchObject({ authorization_id: fixture.authorizationId, host_name: fixture.hostName, is_paired: true });
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenLastCalledWith({
    body: JSON.stringify({ pair_request_id: 'pair-request-1' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    url: 'http://10.0.2.2:38641/companion/pair'
  });
  expect(capacitorMock.plugin.savePairingCredentials).toHaveBeenCalledWith(expect.objectContaining({
    authorization_id: fixture.authorizationId,
    host_name: fixture.hostName,
    remote_peer_id: 'device-desktop'
  }));
  expect(capacitorMock.plugin.loadPairingState).toHaveBeenCalledOnce();
  expect(writerQueueMock.run).toHaveBeenCalledTimes(1);
  expect(queueEvents).toEqual(['start', 'sign', 'end']);
  expect(capacitorMock.plugin.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    method: 'GET',
    path_with_query: '/companion/sync-pack?after_state_seq=0'
  }));
});

it('fails native pairing when credentials cannot be read back locally', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  mockNativePairingHttp();
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue({ is_paired: false });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({ is_paired: false });

  await requestCompanionPairing({
    hostName: 'Pixel 9',
    hostPlatform: 'android',
    endpointUrl: 'http://10.0.2.2:38641'
  });
  await expect(pairCompanionWithDesktop({
    hostName: 'Pixel 9',
    hostPlatform: 'android',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).rejects.toThrow('Native pairing credentials were not saved.');
});
