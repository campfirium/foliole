import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    loadPairingState: vi.fn(),
    savePairingCredentials: vi.fn(),
    signCompanionSyncRequest: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

import {
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from './companionWorkspaceSync';
import { mockFetchJson, resetCompanionWorkspaceSyncTestState } from './companionWorkspaceSync.testSupport';

function mockApprovedDesktopPairing(deviceId = 'web-preview-device') {
  mockFetchJson({
    device_id: deviceId,
    device_secret: 'test-secret',
    paired_at: '2026-04-22T12:00:00.000Z',
    peer_id: 'desktop-local'
  });
}

beforeEach(() => resetCompanionWorkspaceSyncTestState(capacitorMock));

describe('companionWorkspaceSync pairing', () => {
  it('discovers the desktop, requests pairing, and stores web preview credentials after approval', async () => {
    mockFetchJson({ app_version: '0.1.0', desktop_name: 'Foliole Desktop', pairing_mode: 'desktop-confirm', peer_id: 'desktop-local' });

    await expect(loadCompanionDiscovery('http://10.0.2.2:38641/')).resolves.toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
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
    await expect(loadCompanionPairingState()).resolves.toMatchObject({ is_paired: true });
  });
});

it('verifies native pairing credentials are readable after saving', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  mockApprovedDesktopPairing('android-test-device');
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z'
  });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-04-22T12:00:00.000Z'
  });

  await expect(pairCompanionWithDesktop({
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).resolves.toMatchObject({ is_paired: true, device_name: 'Pixel 9' });
  expect(capacitorMock.plugin.loadPairingState).toHaveBeenCalledTimes(1);
});

it('fails native pairing when credentials cannot be read back locally', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  mockApprovedDesktopPairing('android-test-device');
  capacitorMock.plugin.savePairingCredentials.mockResolvedValue({ is_paired: false });
  capacitorMock.plugin.loadPairingState.mockResolvedValue({ is_paired: false });

  await expect(pairCompanionWithDesktop({
    deviceKind: 'android-capacitor',
    deviceName: 'Pixel 9',
    endpointUrl: 'http://10.0.2.2:38641',
    pairRequestId: 'pair-request-1'
  })).rejects.toThrow('Android pairing credentials were not saved.');
});
