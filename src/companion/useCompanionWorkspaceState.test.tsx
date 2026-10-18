// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';

import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true,
  FolioleCompanionSync: {}
}));

afterEach(() => { cleanup(); companionWorkspaceSnapshots.reset(null); });

const initial: NativeCompanionWorkspaceSyncState = {
  endpoint_url: null, last_synced_at: null, remembered_targets: [], sync_events: [],
  sync_onboarding_status: 'completed', workspace_snapshot: null
};

it('ignores snapshots carried by late whole-state updates while accepting their metadata', () => {
  const snapshot = { activeNodeId: null, nodeOrder: [], nodesById: {}, trashedNodeIds: [], untitledSequenceByParent: {} };
  companionWorkspaceSnapshots.reset(snapshot);
  const { result } = renderHook(() => useCompanionWorkspaceState(initial));
  act(() => result.current[1]({ ...initial, endpoint_url: 'http://peer' }));
  expect(result.current[0].workspace_snapshot).toBe(snapshot);
  expect(result.current[0].endpoint_url).toBe('http://peer');
  act(() => result.current[1](current => ({ ...current, workspace_snapshot: null })));
  expect(result.current[0].workspace_snapshot).toBe(snapshot);
  act(() => companionWorkspaceSnapshots.reset(null));
  expect(result.current[0].workspace_snapshot).toBeNull();
});


it('publishes an intermediate read then includes commits registered during that read', async () => {
  const first: WorkspaceSnapshot = { activeNodeId: null, nodeOrder: [], nodesById: {}, trashedNodeIds: [], untitledSequenceByParent: {} };
  const intermediate = { ...first, activeNodeId: 'remote' };
  const combined = { ...first, activeNodeId: 'local', nodeOrder: ['remote', 'local'] };
  companionWorkspaceSnapshots.reset(first);
  const { result } = renderHook(() => useCompanionWorkspaceState(initial));
  let finish!: (value: typeof first) => void;
  let finishNext!: (value: typeof first) => void;
  const reads = [new Promise<typeof first>(done => { finish = done; }),
    new Promise<typeof first>(done => { finishNext = done; })];
  let count = 0;
  companionWorkspaceSnapshots.register({ kind: 'nodes', nodeIds: ['remote'] });
  const work = companionWorkspaceSnapshots.refresh(() => reads[count++]!);
  companionWorkspaceSnapshots.register({ kind: 'nodes', nodeIds: ['local'] });
  await act(async () => { finish(intermediate); await Promise.resolve(); });
  expect(result.current[0].workspace_snapshot).toBe(intermediate);
  await act(async () => { finishNext(combined); await work; });
  expect(result.current[0].workspace_snapshot).toBe(combined);
  expect(count).toBe(2);
});

it('does not replay an old snapshot through a deferred React state updater', () => {
  const before = { activeNodeId: null, nodeOrder: [], nodesById: {}, trashedNodeIds: [], untitledSequenceByParent: {} };
  const after = { ...before, nodeOrder: ['local', 'remote'] };
  companionWorkspaceSnapshots.reset(before);
  const { result } = renderHook(() => useCompanionWorkspaceState(initial));
  const delayed = (state: NativeCompanionWorkspaceSyncState) => ({ ...state,
    workspace_snapshot: before, last_synced_at: 'now' });
  act(() => companionWorkspaceSnapshots.reset(after));
  act(() => { result.current[1](delayed); result.current[1](delayed); });
  expect(result.current[0].workspace_snapshot).toBe(after);
  expect(result.current[0].last_synced_at).toBe('now');
});
