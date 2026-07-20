import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  diagnoseSync: vi.fn(),
  supported: vi.fn(() => true)
}));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { diagnoseSync: runtime.diagnoseSync },
  isNativeCompanionSyncDiagnosticsRuntime: runtime.supported
}));

import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';

it('loads the existing diagnoseSync bridge on an iOS diagnostics runtime', async () => {
  runtime.diagnoseSync.mockResolvedValue({ host: 'ios' });

  await expect(loadLocalSyncDiagnostics()).resolves.toEqual({ host: 'ios' });
  expect(runtime.diagnoseSync).toHaveBeenCalledOnce();
});
