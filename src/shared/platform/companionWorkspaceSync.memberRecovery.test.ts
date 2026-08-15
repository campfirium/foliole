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
  decryptCompanionPairingSecret: vi.fn(async () => 'test-secret'), dropCompanionPairingPrivateKey: vi.fn()
}));
vi.mock('./companion/sync/syncGroupStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/sync/syncGroupStore')>(),
  joinCompanionSyncGroup: syncGroupMock.join,
  loadCompanionSyncGroup: syncGroupMock.load,
  loadCompanionSyncGroupLibraryFacts: syncGroupMock.facts,
  loadCompanionSyncGroupWorkgroupKey: syncGroupMock.loadKey
}));

import { pairCompanionWithDesktop, requestCompanionPairing } from './companionWorkspaceSync';

const protocol = { capabilities: ['lan-sync-v1'], max_supported_version: 1,
  min_supported_version: 1, version: 1 };
const compatibility = { missing_capabilities: [], negotiated_version: 1,
  reason: null, status: 'compatible' };
const encryptedSecret = { algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ciphertext: 'ciphertext',
  iv: 'iv', salt: 'salt', server_public_key: 'server-public-key' };

beforeEach(() => {
  vi.clearAllMocks();
  syncGroupMock.facts.mockResolvedValue({
    attachment_count: 0, content_blob_count: 0, node_count: 1399,
    review_log_count: 0, timeline_id: 'timeline-1'
  });
  syncGroupMock.load.mockResolvedValue({
    group_id: 'group-1', local_device_id: 'Xiaomi 23049RAD8C', local_member_state: 'active',
    members: [{ device_id: 'Xiaomi 23049RAD8C', device_kind: 'android-capacitor',
      device_name: 'Xiaomi 23049RAD8C', state: 'active' }], timeline_id: 'timeline-1'
  });
  syncGroupMock.loadKey.mockResolvedValue(null);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({ expires_at: '2026-08-15T12:00:00Z', pair_request_id: 'request-1' }),
    status: 202
  });
});

async function requestAs(deviceName: string) {
  await requestCompanionPairing({
    deviceId: 'local-installation', deviceKind: 'android-capacitor', deviceName,
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1',
    groupTag: 'tag-1', timelineId: 'timeline-1'
  });
  const request = capacitorMock.plugin.desktopHttpRequest.mock.calls[0]?.[0];
  return JSON.parse(request.body);
}

it('keeps the active member id while sending the current public device name', async () => {
  await expect(requestAs('Xiaomi 23049RAD8C')).resolves.toMatchObject({
    device_id: 'Xiaomi 23049RAD8C', device_name: 'Xiaomi 23049RAD8C'
  });
});

it('keeps the active member id when the public device name changes', async () => {
  await expect(requestAs('Different host')).resolves.toMatchObject({
    device_id: 'Xiaomi 23049RAD8C', device_name: 'Different host'
  });
});

it('stores an approved Sync Group key only in the group database', async () => {
  const group = {
    created_at: '2026-04-22T12:00:00.000Z', created_by_device_id: 'device-desktop',
    display_name: 'Daily', group_id: 'group-1', local_device_id: 'android-test-device',
    local_member_state: 'active', members: [{ approved_by_device_id: 'device-desktop',
      authorization_id: 'join-1', device_id: 'android-test-device', device_kind: 'android',
      device_name: 'Pixel 9', joined_at: '2026-04-22T12:00:00.000Z', state: 'active' }],
    timeline_id: 'timeline-1'
  };
  capacitorMock.plugin.desktopHttpRequest
    .mockResolvedValueOnce({ body: JSON.stringify({ compatibility, desktop_protocol: protocol,
      expires_at: '2026-04-22T12:02:00.000Z', pair_request_id: 'pair-request-1', status: 'pending' }), status: 202 })
    .mockResolvedValueOnce({ body: JSON.stringify({ compatibility, desktop_protocol: protocol,
      device_id: 'android-test-device', encrypted_device_secret: encryptedSecret,
      paired_at: '2026-04-22T12:00:00.000Z', peer_id: 'device-desktop',
      provider_device_id: 'device-desktop', provider_encrypted_device_secret: encryptedSecret,
      sync_group: group }), status: 200 });
  syncGroupMock.join.mockImplementation(async () => {
    syncGroupMock.load.mockResolvedValue(group);
    syncGroupMock.loadKey.mockResolvedValue('test-secret');
  });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({ is_paired: false });

  await requestCompanionPairing({ deviceId: 'Pixel 9', deviceKind: 'android', deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1', groupTag: 'tag-1' });
  await pairCompanionWithDesktop({ deviceKind: 'android', deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641', groupId: 'group-1', groupTag: 'tag-1',
    pairRequestId: 'pair-request-1' });

  expect(syncGroupMock.join).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: 'android-test-device', workgroupKey: 'test-secret'
  }));
  expect(capacitorMock.plugin.bindSyncGroupPeerRoute).toHaveBeenCalledWith(expect.objectContaining({
    local_device_id: 'android-test-device', sync_group_id: 'group-1'
  }));
  expect(capacitorMock.plugin.savePairingCredentials).not.toHaveBeenCalled();
});
