// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';

import { previewCompanionTrash } from './companionTrashPreview';
import { useCompanionWorkspaceTransaction } from './useCompanionWorkspaceHistory';
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

function node(id: string, parentNodeId: string | null): WorkspaceNodeSnapshot {
  return { id, kind: parentNodeId ? 'topic' : 'folder', parentNodeId, title: id, content: '', isTitleManual: true,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null, createdAt: 'then', updatedAt: 'then' };
}

function library(): WorkspaceSnapshot {
  return { activeNodeId: 'a', nodeOrder: ['folder', 'a', 'a1', 'b'], trashedNodeIds: [], untitledSequenceByParent: {},
    nodesById: { folder: node('folder', null), a: node('a', 'folder'), a1: node('a1', 'a'), b: node('b', 'folder') } };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function renderWorkspace() {
  const state = renderHook(() => useCompanionWorkspaceState(initial));
  const transaction = renderHook(() => useCompanionWorkspaceTransaction({
    flush: async () => {}, refresh: async () => true, afterRefresh: () => {} }));
  return { shown: () => state.result.current[0].workspace_snapshot!, run: transaction.result.current.run };
}

it('shows a moved subtree in Trash before the write finishes and keeps it after the write commits', async () => {
  const base = library();
  companionWorkspaceSnapshots.reset(base);
  const workspace = renderWorkspace();
  const write = deferred();
  let running!: Promise<void>;
  act(() => { running = workspace.run(() => write.promise, undefined, undefined, () => previewCompanionTrash(['a'])); });
  expect(workspace.shown().trashedNodeIds).toEqual(['a', 'a1']);
  expect(workspace.shown().nodeOrder).toEqual(['folder', 'b']);
  expect(workspace.shown().activeNodeId).toBe('folder');
  const committed = { ...base, nodeOrder: ['folder', 'b'] };
  await act(async () => { write.resolve(); companionWorkspaceSnapshots.reset(committed); await running; });
  expect(workspace.shown()).toBe(committed);
});

it('puts the moved subtree back when the write fails', async () => {
  const base = library();
  companionWorkspaceSnapshots.reset(base);
  const workspace = renderWorkspace();
  const write = deferred();
  let running!: Promise<void>;
  act(() => { running = workspace.run(() => write.promise, undefined, undefined, () => previewCompanionTrash(['a'])); });
  expect(workspace.shown().trashedNodeIds).toEqual(['a', 'a1']);
  await act(async () => { write.reject(new Error('write_failed')); await running; });
  expect(workspace.shown()).toBe(base);
});
