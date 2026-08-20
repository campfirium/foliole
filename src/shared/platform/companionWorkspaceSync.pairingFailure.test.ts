import { beforeEach, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    desktopHttpRequest: vi.fn(), loadPairingState: vi.fn(),
    savePairingCredentials: vi.fn(), signCompanionSyncRequest: vi.fn()
  }
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
  loadCompanionSyncGroup: vi.fn(async () => null),
  loadCompanionSyncGroupLibraryFacts: vi.fn(async () => ({
    attachment_count: 0, content_blob_count: 0, node_count: 0,
    review_log_count: 0, timeline_id: 'timeline-1'
  })),
  loadCompanionSyncGroupWorkgroupKey: vi.fn(async () => null)
}));

import { pairCompanionWithDesktop, requestCompanionPairing } from './companionWorkspaceSync';
import { resetCompanionWorkspaceSyncTestState } from './companionWorkspaceSync.testSupport';

const protocol = { capabilities: ['lan-sync-v1'], max_supported_version: 1,
  min_supported_version: 1, version: 1 };
const pairing = {
  device_id: 'android-test-device', device_kind: 'android', device_name: 'Pixel 9',
  is_paired: true, negotiated_protocol_version: 1, paired_at: '2026-04-22T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCompanionWorkspaceSyncTestState(capacitorMock);
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  capacitorMock.plugin.desktopHttpRequest
    .mockResolvedValueOnce({ body: JSON.stringify({
      expires_at: '2026-04-22T12:02:00.000Z', pair_request_id: 'pair-request-1', status: 'pending'
    }), status: 202 })
    .mockResolvedValueOnce({ body: JSON.stringify({
      compatibility: { missing_capabilities: [], negotiated_version: 1, reason: null, status: 'compatible' },
      desktop_protocol: protocol, device_id: 'android-test-device', encrypted_device_secret: {
        algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ciphertext: 'ciphertext', iv: 'iv',
        salt: 'salt', server_public_key: 'server-public-key'
      }, paired_at: pairing.paired_at, peer_id: 'device-desktop'
    }), status: 200 });
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue(pairing);
  capacitorMock.plugin.loadPairingState.mockResolvedValue(pairing);
  capacitorMock.plugin.signCompanionSyncRequest.mockRejectedValue(
    new Error('Failed to sign companion sync request.')
  );
});

it('fails native pairing when saved credentials cannot sign sync requests', async () => {
  await requestCompanionPairing({ deviceId: 'android-test-device', deviceKind: 'android',
    deviceName: 'Pixel 9', endpointUrl: 'http://10.0.2.2:38641' });
  await expect(pairCompanionWithDesktop({ deviceKind: 'android', deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641', pairRequestId: 'pair-request-1' }))
    .rejects.toThrow(/Native pairing credentials cannot sign sync requests/u);
});
