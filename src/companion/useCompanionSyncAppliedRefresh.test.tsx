// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { publishCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';

import { createActions, createSnapshot, createSyncState, getWorkspaceRepositoryMock,
  resetSyncActionMocks } from './companionWorkspaceSyncActions.testSupport';
import { useCompanionSyncAppliedRefresh } from './useCompanionSyncAppliedRefresh';

beforeEach(resetSyncActionMocks);
afterEach(cleanup);

it('refreshes the visible saved workspace after an incoming commit and preserves connection state', async () => {
  const { callbacks } = createActions();
  const snapshot = createSnapshot('incoming-phone-topic');
  getWorkspaceRepositoryMock().refreshCompanionWorkspaceAfterSync.mockResolvedValue(snapshot);
  const { unmount } = renderHook(() => useCompanionSyncAppliedRefresh(
    callbacks.setState, callbacks.setSyncConflictCount, callbacks.setError
  ));
  await act(async () => { publishCompanionSyncApplied(); });
  const current = createSyncState({ endpoint_url: 'http://peer:38641', last_synced_at: 'recent' });
  const update = callbacks.setState.mock.lastCall?.[0];
  expect(update(current)).toEqual({ ...current, workspace_snapshot: snapshot });
  expect(callbacks.setSyncConflictCount).toHaveBeenCalledWith(0);
  expect(callbacks.setError).not.toHaveBeenCalled();
  unmount();
  callbacks.setState.mockClear();
  await act(async () => { publishCompanionSyncApplied(); });
  expect(callbacks.setState).not.toHaveBeenCalled();
});

it('keeps the last visible workspace if refreshing committed data fails', async () => {
  const { callbacks } = createActions();
  getWorkspaceRepositoryMock().refreshCompanionWorkspaceAfterSync.mockRejectedValue(new Error('read failed'));
  renderHook(() => useCompanionSyncAppliedRefresh(
    callbacks.setState, callbacks.setSyncConflictCount, callbacks.setError
  ));
  await act(async () => { publishCompanionSyncApplied(); });
  expect(callbacks.setState).not.toHaveBeenCalled();
  expect(callbacks.setError).toHaveBeenCalledWith('read failed');
});
