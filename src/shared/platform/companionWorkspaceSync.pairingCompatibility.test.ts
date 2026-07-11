import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {}
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

import { writeWebPairingState } from './companionPairingState';
import { createSignedRequestHeaders, requestCompanionPairing } from './companionWorkspacePairing';
import { loadCompanionDiscovery, loadCompanionPairingState, pairCompanionWithDesktop } from './companionWorkspaceSync';
import { mockFetchJson, resetCompanionWorkspaceSyncTestState } from './companionWorkspaceSync.testSupport';

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};

beforeEach(() => resetCompanionWorkspaceSyncTestState(capacitorMock));

describe('companionWorkspaceSync negotiated pairing', () => {
  it('stores negotiated Web pairing metadata after approval', async () => {
    mockFetchJson({
      app_version: '0.1.0',
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'device-desktop',
      protocol
    });
    await expect(loadCompanionDiscovery('http://10.0.2.2:38641/')).resolves.toMatchObject({
      peer_id: 'device-desktop'
    });

    const compatibility = {
      missing_capabilities: [],
      negotiated_version: 1,
      reason: null,
      status: 'compatible'
    };
    mockFetchJson({
      compatibility,
      desktop_protocol: protocol,
      expires_at: '2026-04-22T12:02:00.000Z',
      pair_request_id: 'pair-request-1',
      status: 'pending'
    }, 202);
    await requestCompanionPairing({
      deviceId: 'web-preview-device',
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/'
    });

    mockFetchJson({
      compatibility,
      desktop_protocol: protocol,
      device_id: 'web-preview-device',
      encrypted_device_secret: {
        algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM',
        ciphertext: 'ciphertext',
        iv: 'iv',
        salt: 'salt',
        server_public_key: 'server-public-key'
      },
      paired_at: '2026-04-22T12:00:00.000Z',
      peer_id: 'device-desktop'
    });
    await pairCompanionWithDesktop({
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641/',
      pairRequestId: 'pair-request-1'
    });
    await expect(loadCompanionPairingState()).resolves.toMatchObject({
      is_paired: true,
      negotiated_protocol_version: 1,
      primary_device_id: 'device-desktop'
    });
  });

});

describe('companionWorkspaceSync pairing rejection', () => {
  it('treats a structured protocol 409 as rejection instead of a pending request', async () => {
    mockFetchJson({
      compatibility: {
        missing_capabilities: [],
        negotiated_version: null,
        reason: 'protocol_version_unsupported',
        status: 'incompatible'
      },
      error: 'protocol_incompatible'
    }, 409);

    await expect(requestCompanionPairing({
      deviceId: 'web-preview-device',
      deviceKind: 'web-preview',
      deviceName: 'Preview',
      endpointUrl: 'http://10.0.2.2:38641'
    })).rejects.toMatchObject({ code: 'protocol_incompatible', status: 409 });
  });

});

describe('companionWorkspaceSync pairing repair', () => {
  it('does not sign Web sync requests for old pairing records without protocol metadata', async () => {
    writeWebPairingState({
      device_id: 'web-preview-device',
      device_kind: 'web-preview',
      device_name: 'Preview',
      device_secret: 'old-secret',
      is_paired: true,
      paired_at: '2026-04-22T12:00:00.000Z',
      primary_device_id: 'device-desktop'
    });

    await expect(createSignedRequestHeaders({
      method: 'GET',
      pathWithQuery: '/companion/sync-pack?after_state_seq=0'
    })).rejects.toThrow('compatible desktop sync source');
  });
});
