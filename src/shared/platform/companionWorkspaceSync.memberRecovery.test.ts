import { beforeEach, expect, it, vi } from 'vitest';

const syncGroupMock = vi.hoisted(() => ({
  facts: vi.fn(), join: vi.fn(), load: vi.fn(), loadKey: vi.fn()
}));
const capacitorMock = vi.hoisted(() => ({
  plugin: {
    bindSyncGroupPeerRoute: vi.fn(), desktopHttpRequest: vi.fn(),
    loadPairingState: vi.fn(), savePairingCredentials: vi.fn(), signCompanionSyncRequest: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companionPairingEncryption', () => ({
  createCompanionPairingPublicKey: vi.fn(async () => 'client-public-key'),
  decryptCompanionPairingSecret: vi.fn(), dropCompanionPairingPrivateKey: vi.fn()
}));
vi.mock('./companion/sync/syncGroupStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/sync/syncGroupStore')>(),
  joinCompanionSyncGroup: syncGroupMock.join,
  loadCompanionSyncGroup: syncGroupMock.load,
  loadCompanionSyncGroupLibraryFacts: syncGroupMock.facts,
  loadCompanionSyncGroupWorkgroupKey: syncGroupMock.loadKey
}));

import { decryptCompanionPairingSecret } from './companionPairingEncryption';
import { pairCompanionWithDesktop, requestCompanionPairing } from './companionWorkspaceSync';

const protocol = { capabilities: ['lan-sync-v1'], max_supported_version: 1,
  min_supported_version: 1, version: 1 };
const compatibility = { missing_capabilities: [], negotiated_version: 1,
  reason: null, status: 'compatible' };
const encryptedSecret = { algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ciphertext: 'ciphertext',
  iv: 'iv', salt: 'salt', server_public_key: 'server-public-key' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(decryptCompanionPairingSecret)
    .mockResolvedValueOnce('pairing-credential')
    .mockResolvedValueOnce('test-secret');
  syncGroupMock.facts.mockResolvedValue({
    attachment_count: 0, content_blob_count: 0, node_count: 1399,
    review_log_count: 0, timeline_id: 'timeline-1'
  });
  syncGroupMock.load.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'Xiaomi 23049RAD8C', local_member_state: 'active',
    members: [{ authorization_id: 'authorization-a5', host_name: 'Xiaomi 23049RAD8C',
      host_platform: 'android-capacitor', joined_at: '2026-04-22T12:00:00.000Z', state: 'active' }],
    timeline_id: 'timeline-1'
  });
  syncGroupMock.loadKey.mockResolvedValue(null);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({ expires_at: '2026-08-15T12:00:00Z', pair_request_id: 'request-1' }),
    status: 202
  });
});

async function requestAs(hostName: string) {
  await requestCompanionPairing({
    hostName, hostPlatform: 'android-capacitor',
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1',
    groupTag: 'tag-1', timelineId: 'timeline-1'
  });
  const request = capacitorMock.plugin.desktopHttpRequest.mock.calls[0]?.[0];
  return JSON.parse(request.body);
}

it('keeps the active member Host independent from the bootstrap request token', async () => {
  await expect(requestAs('Xiaomi 23049RAD8C')).resolves.toMatchObject({
    host_name: 'Xiaomi 23049RAD8C'
  });
});

it('keeps the active member Host when the current device label changes', async () => {
  await expect(requestAs('Different host')).resolves.toMatchObject({
    host_name: 'Xiaomi 23049RAD8C'
  });
});

it('stores an approved Sync Group key separately from pairing authorization', async () => {
  const group = {
    created_at: '2026-04-22T12:00:00.000Z', created_by_host_name: 'Desktop',
    display_name: 'Daily', group_id: 'group-1', local_host_name: 'Pixel 9',
    local_member_state: 'active', members: [{ approved_by_host_name: 'Desktop',
      authorization_id: 'authorization-a5', host_name: 'Pixel 9', host_platform: 'android-capacitor',
      joined_at: '2026-04-22T12:00:00.000Z', state: 'active' },
    { approved_by_host_name: 'Desktop', authorization_id: 'authorization-desktop',
      host_name: 'Desktop', host_platform: 'darwin',
      joined_at: '2026-04-22T12:00:00.000Z', state: 'active' }],
    timeline_id: 'timeline-1'
  };
  capacitorMock.plugin.desktopHttpRequest
    .mockResolvedValueOnce({ body: JSON.stringify({ compatibility, desktop_protocol: protocol,
      expires_at: '2026-04-22T12:02:00.000Z', pair_request_id: 'pair-request-1', status: 'pending' }), status: 202 })
    .mockResolvedValueOnce({ body: JSON.stringify({ compatibility, desktop_protocol: protocol,
      authorization_id: 'authorization-a5',
      encrypted_credential_secret: encryptedSecret, host_name: 'Pixel 9',
      host_platform: 'android-capacitor', paired_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'authorization-desktop', provider_authorization_id: 'authorization-desktop',
      provider_encrypted_credential_secret: encryptedSecret,
      provider_host_name: 'Desktop', provider_host_platform: 'darwin',
      sync_group: group }), status: 200 });
  syncGroupMock.join.mockImplementation(async () => {
    syncGroupMock.load.mockResolvedValue(group);
    syncGroupMock.loadKey.mockResolvedValue('test-secret');
  });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({
    authorization_id: 'authorization-a5', host_name: 'Pixel 9', host_platform: 'android-capacitor',
    is_paired: true, paired_at: '2026-04-22T12:00:00.000Z'
  });
  capacitorMock.plugin.signCompanionSyncRequest.mockResolvedValue({ headers: {
    'X-Authorization-Id': 'authorization-a5', 'X-Nonce': 'nonce',
    'X-Signature': 'signature', 'X-Timestamp': '2026-04-22T12:00:00.000Z'
  } });

  await requestCompanionPairing({ hostName: 'Pixel 9', hostPlatform: 'android',
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1', groupTag: 'tag-1' });
  await pairCompanionWithDesktop({ hostName: 'Pixel 9', hostPlatform: 'android',
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1', groupTag: 'tag-1',
    pairRequestId: 'pair-request-1' });

  expect(syncGroupMock.join).toHaveBeenCalledWith(expect.objectContaining({
    hostName: 'Pixel 9', workgroupKey: 'test-secret'
  }));
  expect(capacitorMock.plugin.bindSyncGroupPeerRoute).toHaveBeenCalledWith(expect.objectContaining({
    local_authorization_id: 'authorization-a5', local_host_name: 'Pixel 9',
    peer_authorization_id: 'authorization-desktop', sync_group_id: 'group-1'
  }));
  expect(capacitorMock.plugin.bindSyncGroupPeerRoute).not.toHaveBeenCalledWith(expect.objectContaining({
    local_device_id: expect.anything()
  }));
  expect(capacitorMock.plugin.savePairingCredentials).toHaveBeenCalledWith(expect.objectContaining({
    authorization_id: 'authorization-a5', credential_secret: 'pairing-credential'
  }));
  expect(capacitorMock.plugin.savePairingCredentials).not.toHaveBeenCalledWith(expect.objectContaining({
    credential_secret: 'test-secret'
  }));
});
