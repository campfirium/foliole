import { beforeEach, describe, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
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

import {
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from './companionWorkspaceSync';
import { mockFetchJson, resetCompanionWorkspaceSyncTestState } from './companionWorkspaceSync.testSupport';

function createEncryptedSecretFixture() {
  return {
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM' as const,
    ciphertext: 'ciphertext',
    iv: 'iv',
    salt: 'salt',
    server_public_key: 'server-public-key'
  };
}

function mockApprovedDesktopPairing(deviceId = 'web-preview-device') {
  mockFetchJson({
    device_id: deviceId,
    encrypted_device_secret: createEncryptedSecretFixture(),
    paired_at: '2026-04-22T12:00:00.000Z',
    peer_id: 'device-desktop'
  });
}

function mockNativePairingHttp() {
  capacitorMock.plugin.desktopHttpRequest
    .mockResolvedValueOnce({
      body: JSON.stringify({
        expires_at: '2026-04-22T12:02:00.000Z',
        pair_request_id: 'pair-request-1',
        status: 'pending'
      }),
      status: 202
    })
    .mockResolvedValueOnce({
      body: JSON.stringify({
        device_id: 'android-test-device',
        encrypted_device_secret: createEncryptedSecretFixture(),
        paired_at: '2026-04-22T12:00:00.000Z',
        peer_id: 'device-desktop'
      }),
      status: 200
    });
}

beforeEach(() => {
  resetCompanionWorkspaceSyncTestState(capacitorMock);
  writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
});

describe('companionWorkspaceSync pairing', () => {
  it('discovers the desktop, requests pairing, and stores web preview credentials after approval', async () => {
    mockFetchJson({ app_version: '0.1.0', desktop_name: 'Foliole Desktop', pairing_mode: 'desktop-confirm', peer_id: 'device-desktop' });

    await expect(loadCompanionDiscovery('http://10.0.2.2:38641/')).resolves.toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'device-desktop'
    });

    mockFetchJson({ expires_at: '2026-04-22T12:02:00.000Z', pair_request_id: 'pair-request-1', status: 'pending' }, 202);
    await expect(requestCompanionPairing({
      deviceId: 'web-preview-device',
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/'
    })).resolves.toMatchObject({ pair_request_id: 'pair-request-1', status: 'pending' });

    mockApprovedDesktopPairing();
    await expect(pairCompanionWithDesktop({
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/',
      pairRequestId: 'pair-request-1'
    })).resolves.toMatchObject({ is_paired: true, paired_at: '2026-04-22T12:00:00.000Z' });
    await expect(loadCompanionPairingState()).resolves.toMatchObject({ is_paired: true, primary_device_id: 'device-desktop' });
  });
});

it('verifies native pairing credentials are readable after saving', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  mockNativePairingHttp();
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z',
    primary_device_id: 'device-desktop'
  });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z',
    primary_device_id: 'device-desktop'
  });
  capacitorMock.plugin.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Nonce': 'nonce',
      'X-Signature': 'signed',
      'X-Timestamp': '2026-04-22T12:00:00.000Z'
    }
  });

  await requestCompanionPairing({
    deviceId: 'android-test-device',
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641'
  });
  await expect(pairCompanionWithDesktop({
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).resolves.toMatchObject({ is_paired: true, device_name: 'Pixel 9' });
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenLastCalledWith({
    body: JSON.stringify({ pair_request_id: 'pair-request-1' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    url: 'http://10.0.2.2:38641/companion/pair'
  });
  expect(capacitorMock.plugin.savePairingCredentials).toHaveBeenCalledWith(expect.objectContaining({
    primary_device_id: 'device-desktop'
  }));
  expect(capacitorMock.plugin.loadPairingState).toHaveBeenCalledTimes(1);
  expect(writerQueueMock.run).toHaveBeenCalledTimes(1);
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
    deviceId: 'android-test-device',
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641'
  });
  await expect(pairCompanionWithDesktop({
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).rejects.toThrow('Android pairing credentials were not saved.');
});

it('fails native pairing when saved credentials cannot sign sync requests', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  mockNativePairingHttp();
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z',
    primary_device_id: 'device-desktop'
  });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z',
    primary_device_id: 'device-desktop'
  });
  capacitorMock.plugin.signCompanionSyncRequest.mockRejectedValue(new Error('Failed to sign companion sync request.'));

  await requestCompanionPairing({
    deviceId: 'android-test-device',
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641'
  });
  await expect(pairCompanionWithDesktop({
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).rejects.toThrow('Android pairing credentials cannot sign sync requests');
});
