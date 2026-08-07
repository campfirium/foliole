import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  diagnoseDatabase: vi.fn(),
  loadPairingState: vi.fn(),
  supported: vi.fn(() => true)
}));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { loadPairingState: runtime.loadPairingState },
  isNativeCompanionSyncDiagnosticsRuntime: runtime.supported
}));
vi.mock('../../runtime/iosCompanionActiveDatabaseDiagnostics', () => ({
  diagnoseIosCompanionDatabase: runtime.diagnoseDatabase
}));

import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';

it('loads shared-owner diagnostics with the native pairing state', async () => {
  const pairing = { device_id: 'ios-device', is_paired: true };
  runtime.loadPairingState.mockResolvedValue(pairing);
  runtime.diagnoseDatabase.mockResolvedValue({ host: 'ios' });

  await expect(loadLocalSyncDiagnostics()).resolves.toEqual({ host: 'ios' });
  expect(runtime.diagnoseDatabase).toHaveBeenCalledWith(pairing);
});
