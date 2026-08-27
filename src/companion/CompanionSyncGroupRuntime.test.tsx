import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  load: vi.fn(), reconcile: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/mutation/companionSyncMutationRevision', () => ({
  getCompanionSyncMutationRevision: () => 0,
  subscribeCompanionSyncMutationRevision: () => () => undefined
}));
vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  reconcileCompanionSyncGroupProvider: runtime.reconcile
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: runtime.load
}));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionSyncGroupRuntime: () => true,
  isNativeCompanionSyncGroupStoreRuntime: () => true
}));

import { CompanionSyncGroupRuntime } from './CompanionSyncGroupRuntime';

afterEach(() => vi.restoreAllMocks());

it('reports a cold-start provider reconciliation failure', async () => {
  const error = new Error('provider_start_failed');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  runtime.load.mockResolvedValue(null);
  runtime.reconcile.mockRejectedValue(error);
  render(<CompanionSyncGroupRuntime bootstrapState={{
    booted_at: '2026-08-27T00:00:00.000Z', database_path: '/data/foliole.db',
    database_ready: true, device_id: 'device-a5', runtime_kind: 'android-capacitor'
  }} workspaceSync={{ state: { last_synced_at: null } } as never}>ready</CompanionSyncGroupRuntime>);

  await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
    '[companion-sync-group] provider reconciliation failed', error
  ));
});
