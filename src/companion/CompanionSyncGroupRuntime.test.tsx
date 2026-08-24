import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  load: vi.fn(async (): Promise<unknown> => null),
  reconcile: vi.fn(async () => null)
}));

vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: runtime.load
}));
vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  reconcileCompanionSyncGroupProvider: runtime.reconcile
}));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionSyncGroupRuntime: () => true,
  isNativeCompanionSyncGroupStoreRuntime: () => true
}));

import { useCompanionSyncGroupProviderAvailability } from './companionSyncGroupProviderAvailability';
import { CompanionSyncGroupRuntime } from './CompanionSyncGroupRuntime';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

afterEach(() => {
  runtime.load.mockReset().mockResolvedValue(null);
  runtime.reconcile.mockReset().mockResolvedValue(null);
});

function workspaceSync() {
  return {
    bootstrapState: {
      database_path: 'foliole-companion-preview.db', device_id: 'android-b',
      runtime_kind: 'android-capacitor'
    },
    pairingState: { device_id: 'android-b', is_paired: true },
    state: { last_synced_at: null }
  } as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
}

const bootstrapState = workspaceSync().bootstrapState;

function RuntimeState() {
  const providerAvailable = useCompanionSyncGroupProviderAvailability();
  return <output>{providerAvailable ? 'available' : 'starting'}</output>;
}

it('maintains the member provider before any settings surface is mounted', async () => {
  const group = { group_id: 'group-1', local_host_name: 'Android B', local_member_state: 'active' };
  runtime.load.mockResolvedValue(group);
  render(<CompanionSyncGroupRuntime bootstrapState={bootstrapState} workspaceSync={workspaceSync()}>
    <main>Reader</main>
  </CompanionSyncGroupRuntime>);
  await act(async () => Promise.resolve());
  expect(runtime.reconcile).toHaveBeenCalledWith(
    expect.objectContaining({ device_id: 'android-b' }), group, '0:'
  );
});

it('withholds public sync availability until provider lifecycle completes', async () => {
  let resolveProvider: (value: null) => void = () => undefined;
  runtime.load.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'Android B', local_member_state: 'active'
  });
  runtime.reconcile.mockReturnValueOnce(new Promise((resolve) => { resolveProvider = resolve; }));
  render(<CompanionSyncGroupRuntime bootstrapState={bootstrapState} workspaceSync={workspaceSync()}>
    <RuntimeState />
  </CompanionSyncGroupRuntime>);
  await act(async () => Promise.resolve());
  expect(document.querySelector('output')).toHaveTextContent('starting');
  await act(async () => resolveProvider(null));
  expect(document.querySelector('output')).toHaveTextContent('available');
});

it('starts a copied group database without requiring separate host credentials', async () => {
  const group = { group_id: 'group-1', local_host_name: 'Android B', local_member_state: 'active' };
  const sync = workspaceSync();
  sync.pairingState = { is_paired: false, paired_at: null };
  runtime.load.mockResolvedValue(group);
  render(<CompanionSyncGroupRuntime bootstrapState={bootstrapState} workspaceSync={sync}>
    <main>Reader</main>
  </CompanionSyncGroupRuntime>);
  await act(async () => Promise.resolve());
  expect(runtime.reconcile).toHaveBeenCalledWith(expect.anything(), group, '0:');
});

it('does not stop the provider while persisted membership is loading', async () => {
  let resolveGroup: (value: null) => void = () => undefined;
  runtime.load.mockReturnValueOnce(new Promise((resolve) => { resolveGroup = resolve; }));
  render(<CompanionSyncGroupRuntime bootstrapState={bootstrapState} workspaceSync={workspaceSync()}>
    <main>Reader</main>
  </CompanionSyncGroupRuntime>);
  await act(async () => Promise.resolve());
  expect(runtime.reconcile).not.toHaveBeenCalled();
  await act(async () => resolveGroup(null));
  expect(runtime.reconcile).toHaveBeenCalledOnce();
});
