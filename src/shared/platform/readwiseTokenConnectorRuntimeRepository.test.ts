import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

const runtimeMock = vi.hoisted(() => ({ invoke: null as null | ReturnType<typeof vi.fn> }));
const companionMock = vi.hoisted(() => ({
  syncReadwiseCredentialBagFromDesktop: vi.fn(),
  isNative: vi.fn(() => false),
  loadCompanionPairingState: vi.fn(),
  loadCompanionWorkspaceSyncState: vi.fn(),
  plugin: {
    connectReadwiseToken: vi.fn(),
    disconnectReadwiseToken: vi.fn(),
    loadReadwiseTokenConnection: vi.fn()
  }
}));

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: () => runtimeMock.invoke
}));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => companionMock.plugin
}));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({
  isNativeAndroidCompanionRuntime: companionMock.isNative
}));
vi.mock('./companionWorkspacePairing', () => ({
  loadCompanionPairingState: companionMock.loadCompanionPairingState
}));
vi.mock('./companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: companionMock.loadCompanionWorkspaceSyncState
}));
vi.mock('./companionCredentialBag', () => ({
  syncReadwiseCredentialBagFromDesktop: companionMock.syncReadwiseCredentialBagFromDesktop
}));

beforeEach(() => {
  runtimeMock.invoke = null;
  companionMock.isNative.mockReturnValue(false);
  companionMock.syncReadwiseCredentialBagFromDesktop.mockReset();
  companionMock.loadCompanionPairingState.mockReset();
  companionMock.loadCompanionWorkspaceSyncState.mockReset();
  companionMock.loadCompanionWorkspaceSyncState.mockResolvedValue({
    endpoint_url: null,
    last_synced_at: null,
    remembered_targets: [],
    sync_events: [],
    sync_onboarding_status: 'pending',
    workspace_snapshot: null
  });
  companionMock.loadCompanionPairingState.mockResolvedValue({
    device_id: 'device-android',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: false,
    paired_at: null,
    primary_device_id: null
  });
  companionMock.plugin.connectReadwiseToken.mockReset();
  companionMock.plugin.disconnectReadwiseToken.mockReset();
  companionMock.plugin.loadReadwiseTokenConnection.mockReset();
});

it('uses the desktop native command without exposing a stored token', async () => {
  runtimeMock.invoke = vi.fn(async () => ({
    checked_at: null,
    connected: true,
    message: 'Connected',
    status: 'connected'
  }));
  const { connectReadwiseTokenInRuntime } = await import('./readwiseTokenConnectorRuntimeRepository');

  await expect(connectReadwiseTokenInRuntime('token-secret')).resolves.toMatchObject({ connected: true });
  expect(runtimeMock.invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.connectReadwiseToken, { token: 'token-secret' });
});

it('uses the Android companion plugin when running in the native companion', async () => {
  companionMock.isNative.mockReturnValue(true);
  companionMock.plugin.loadReadwiseTokenConnection.mockResolvedValue({
    checked_at: null,
    connected: false,
    message: 'Readwise is not connected.',
    status: 'not_connected'
  });
  const { loadReadwiseTokenConnectionFromRuntime } = await import('./readwiseTokenConnectorRuntimeRepository');

  await expect(loadReadwiseTokenConnectionFromRuntime()).resolves.toMatchObject({ status: 'not_connected' });
  expect(companionMock.plugin.loadReadwiseTokenConnection).toHaveBeenCalled();
});

it('imports a protected Readwise credential bag from the paired desktop when Android has no local token', async () => {
  companionMock.isNative.mockReturnValue(true);
  companionMock.plugin.loadReadwiseTokenConnection.mockResolvedValue({
    checked_at: null,
    connected: false,
    message: 'Readwise is not connected.',
    status: 'not_connected'
  });
  companionMock.loadCompanionWorkspaceSyncState.mockResolvedValue({
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: null,
    remembered_targets: [],
    sync_events: [],
    sync_onboarding_status: 'pending',
    workspace_snapshot: null
  });
  companionMock.syncReadwiseCredentialBagFromDesktop.mockResolvedValue({
    checked_at: '2026-05-10T00:00:00.000Z',
    connected: true,
    message: 'Readwise credentials are ready on this device.',
    status: 'connected'
  });
  const { loadReadwiseTokenConnectionFromRuntime } = await import('./readwiseTokenConnectorRuntimeRepository');

  await expect(loadReadwiseTokenConnectionFromRuntime()).resolves.toMatchObject({ connected: true });
  expect(companionMock.syncReadwiseCredentialBagFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
});

it('blocks Android Readwise connection when paired as a secondary device', async () => {
  companionMock.isNative.mockReturnValue(true);
  companionMock.loadCompanionPairingState.mockResolvedValue({
    device_id: 'device-android',
    device_kind: 'android-capacitor',
    device_name: 'Pixel 9',
    is_paired: true,
    paired_at: '2026-05-10T00:00:00.000Z',
    primary_device_id: 'device-desktop'
  });
  const { connectReadwiseTokenInRuntime } = await import('./readwiseTokenConnectorRuntimeRepository');

  await expect(connectReadwiseTokenInRuntime('token-secret')).resolves.toMatchObject({
    connected: false,
    status: 'not_connected'
  });
  expect(companionMock.plugin.connectReadwiseToken).not.toHaveBeenCalled();
});
