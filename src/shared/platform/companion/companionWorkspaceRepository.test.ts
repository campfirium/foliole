// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: () => ({})
}));

import { createStoredSyncState, createUpdatedStoredSnapshot } from '../companionWorkspaceSync.testSupport';
import { readWebSyncState, writeWebSyncState } from '../companionWorkspaceSyncState';

import { refreshCompanionWorkspaceAfterMutation } from './companionWorkspaceRepository';

beforeEach(() => window.localStorage.clear());

it('stores preview changes while preserving the latest sync metadata', async () => {
  const state = createStoredSyncState();
  state.endpoint_url = 'http://192.168.1.20:38641';
  state.remembered_targets = [state.endpoint_url];
  writeWebSyncState(state);
  const updated = createUpdatedStoredSnapshot().workspaceSnapshot;
  const snapshot = await refreshCompanionWorkspaceAfterMutation(updated);
  expect(snapshot?.nodesById['node-1']?.review?.reps).toBe(2);
  const reloaded = readWebSyncState();
  expect(reloaded.workspace_snapshot).toEqual(snapshot);
  expect(reloaded.endpoint_url).toBe(state.endpoint_url);
  expect(reloaded.remembered_targets).toEqual(state.remembered_targets);
  expect(reloaded.last_synced_at).toBe(state.last_synced_at);
});

it('reads the preview projection without changing it when no result was supplied', async () => {
  writeWebSyncState(createStoredSyncState());
  const before = window.localStorage.getItem('foliole-companion-workspace-sync-state');
  expect(await refreshCompanionWorkspaceAfterMutation()).toEqual(readWebSyncState().workspace_snapshot);
  expect(window.localStorage.getItem('foliole-companion-workspace-sync-state')).toBe(before);
});
