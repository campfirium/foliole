import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  diagnoseDatabase: vi.fn(),
  supported: vi.fn(() => true)
}));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionSyncDiagnosticsRuntime: runtime.supported
}));
vi.mock('../syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => ({ group_id: 'group-test' }))
}));
vi.mock('../../runtime/iosCompanionActiveDatabaseDiagnostics', () => ({
  diagnoseIosCompanionDatabase: runtime.diagnoseDatabase
}));

import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';

it('loads shared-owner diagnostics with the current Sync Group', async () => {
  const group = { group_id: 'group-test' };
  runtime.diagnoseDatabase.mockResolvedValue({ host: 'ios' });

  await expect(loadLocalSyncDiagnostics()).resolves.toEqual({ host: 'ios' });
  expect(runtime.diagnoseDatabase).toHaveBeenCalledWith(group);
});
