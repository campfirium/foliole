import { expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

const workspaceSyncMock = vi.hoisted(() => ({
  bindCompanionWorkspaceSyncTarget: vi.fn(),
  loadCompanionReadableArticle: vi.fn(),
  loadCompanionWorkspaceSyncState: vi.fn(),
  persistCompanionWorkspaceSnapshot: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  removeCompanionWorkspaceSyncRememberedTarget: vi.fn(),
  resolveReachableCompanionWorkspaceSyncEndpoints: vi.fn(async () => []),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);
vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: vi.fn(async () => [])
}));

it('shows a failure that occurs before any member sync run can start', async () => {
  const callbacks = {
    setError: vi.fn(), setReadableArticle: vi.fn(), setState: vi.fn(),
    setStatus: vi.fn(), setSyncConflictCount: vi.fn(), setSyncProgress: vi.fn()
  };
  const state = {
    endpoint_url: 'http://desktop:38641', last_synced_at: null, remembered_targets: [],
    sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: null
  } as NativeCompanionWorkspaceSyncState;
  const actions = createWorkspaceSnapshotActions({ ...callbacks, state });

  await expect(actions.pullFromDesktop('http://desktop:38641'))
    .rejects.toThrow('No reachable Sync Group member is available.');

  expect(callbacks.setStatus).toHaveBeenLastCalledWith('idle');
  expect(callbacks.setSyncProgress).toHaveBeenLastCalledWith(null);
  expect(callbacks.setError).toHaveBeenLastCalledWith('No reachable Sync Group member is available.');
});
