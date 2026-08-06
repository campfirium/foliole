import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  loadPairing: vi.fn(),
  nativeRuntime: vi.fn(() => true)
}));

vi.mock('../../companionWorkspaceDiscovery', () => ({
  discoverCompanionDesktops: mocks.discover
}));
vi.mock('../../companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(),
  loadCompanionPairingState: mocks.loadPairing
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {},
  isNativeCompanionPairingRuntime: mocks.nativeRuntime,
  normalizeEndpointUrl: (value: string) => value.replace(/\/$/u, ''),
  WORKSPACE_VERSION_PATH: '/companion/workspace-version'
}));

import { resolveReachableCompanionWorkspaceSyncEndpoint } from './companionWorkspaceEndpoint';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nativeRuntime.mockReturnValue(true);
  mocks.loadPairing.mockResolvedValue({ remote_peer_id: 'paired-desktop' });
});

it('refreshes a stale LAN endpoint only to the already paired desktop', async () => {
  mocks.discover.mockResolvedValue([
    { discovery: { peer_id: 'other-desktop' }, endpointUrl: 'http://192.168.1.20:38641' },
    { discovery: { peer_id: 'paired-desktop' }, endpointUrl: 'http://192.168.1.30:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://192.168.1.10:38641'))
    .resolves.toBe('http://192.168.1.30:38641');
});

it('keeps the stored endpoint when discovery cannot prove the paired desktop', async () => {
  mocks.discover.mockResolvedValue([
    { discovery: { peer_id: 'other-desktop' }, endpointUrl: 'http://192.168.1.20:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://192.168.1.10:38641'))
    .resolves.toBe('http://192.168.1.10:38641');
});

it('does not perform native discovery for a non-native runtime', async () => {
  mocks.nativeRuntime.mockReturnValue(false);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://desktop.local/'))
    .resolves.toBe('http://desktop.local');
  expect(mocks.discover).not.toHaveBeenCalled();
});
