import { beforeEach, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  loadPairingState: vi.fn(),
  signCompanionSyncRequest: vi.fn()
}));
const groupMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../companionUuid', () => ({ createCompanionUuid: () => 'nonce-1' }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: nativeMock,
  isNativeCompanionPairingRuntime: () => true
}));
vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: groupMock.load }));

import { createSignedRequestHeaders } from './signedRequest';

beforeEach(() => {
  vi.clearAllMocks();
  nativeMock.loadPairingState.mockResolvedValue({
    device_id: 'mobile-b', device_kind: 'android-capacitor', is_paired: true
  });
  groupMock.load.mockResolvedValue({ group_id: 'group-1' });
  nativeMock.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Device-Id': 'mobile-b', 'X-Nonce': 'nonce-1', 'X-Signature': 'signed',
      'X-Timestamp': '2026-08-09T00:00:00.000Z'
    }
  });
});

it('routes a Sync Group request to the exact native peer endpoint', async () => {
  await expect(createSignedRequestHeaders({
    endpointUrl: 'http://192.168.0.11:38641', method: 'GET', pathWithQuery: '/companion/workspace-version'
  })).resolves.toEqual(expect.objectContaining({ 'X-Sync-Group-Id': 'group-1' }));

  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.0.11:38641', sync_group_id: 'group-1'
  }));
});

it('rejects an ambiguous target before asking the native peer store to sign', async () => {
  await expect(createSignedRequestHeaders({
    method: 'GET', pathWithQuery: '/companion/workspace-version'
  })).rejects.toThrow('Sync Group request target is required.');
  expect(nativeMock.signCompanionSyncRequest).not.toHaveBeenCalled();
});
