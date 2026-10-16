import { act, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  load: vi.fn(), reconcile: vi.fn(), revision: 0, notify: () => {}
}));

vi.mock('../shared/platform/companion/sync/mutation/companionSyncMutationRevision', () => ({
  getCompanionSyncMutationRevision: () => runtime.revision,
  subscribeCompanionSyncMutationRevision: (notify: () => void) => { runtime.notify = notify; return () => undefined; }
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
  }} workspaceSync={{
    state: { last_synced_at: null }, syncParticipation: { participating: true }
  } as never}>ready</CompanionSyncGroupRuntime>);

  await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
    '[companion-sync-group] provider reconciliation failed', error
  ));
  runtime.reconcile.mockResolvedValue(null);
  await act(async () => { runtime.revision++; runtime.notify(); });
  await waitFor(() => expect(runtime.reconcile).toHaveBeenCalledTimes(2));
});


it('keeps the provider running across ordinary writes and sync confirmations but reconciles membership changes', async () => {
  runtime.reconcile.mockReset().mockResolvedValue(null);
  const group = { group_id: 'group', local_device_identity_key: 'device', devices: [],
    created_at: 'now', display_name: 'Library' };
  runtime.load.mockReset().mockResolvedValue(group);
  const bootstrap = { booted_at: 'now', database_path: '/data/foliole.db', database_ready: true,
    device_id: 'device', runtime_kind: 'android-capacitor' as const };
  const sync = { state: { last_synced_at: null }, syncParticipation: { participating: true } };
  const view = render(<CompanionSyncGroupRuntime bootstrapState={bootstrap} workspaceSync={sync as never}>ready</CompanionSyncGroupRuntime>);
  await waitFor(() => expect(runtime.reconcile).toHaveBeenCalledTimes(1));
  await act(async () => { runtime.revision++; runtime.notify(); });
  view.rerender(<CompanionSyncGroupRuntime bootstrapState={bootstrap}
    workspaceSync={{ ...sync, state: { last_synced_at: 'later' } } as never}>ready</CompanionSyncGroupRuntime>);
  await waitFor(() => expect(runtime.load).toHaveBeenCalledTimes(3));
  await act(async () => {});
  expect(runtime.reconcile).toHaveBeenCalledTimes(1);
  view.rerender(<CompanionSyncGroupRuntime bootstrapState={bootstrap}
    workspaceSync={{ ...sync, syncParticipation: { participating: false } } as never}>ready</CompanionSyncGroupRuntime>);
  await waitFor(() => expect(runtime.reconcile).toHaveBeenLastCalledWith(bootstrap, group, false));
  runtime.load.mockResolvedValue(null);
  await act(async () => { runtime.revision++; runtime.notify(); });
  await waitFor(() => expect(runtime.reconcile).toHaveBeenLastCalledWith(bootstrap, null, false));
});
