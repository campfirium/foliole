import '../../test/ambientWorkspaceRefresh.testSupport';

import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { notifyWorkspaceContentChanged } from '../../../electron/ipc/workspaceContentChangedEvents.js';
import { stagePendingNodeSync } from '../../shared/platform/workspacePendingNodeSync';
import { createWorkspaceRuntimeNodeSnapshot } from '../../shared/platform/workspaceRuntimeRepository';
import { markNodeContentEdited } from '../../store/workspaceNodeContentVersionGuard';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { commit, controls, invoke, origin, updated } from '../../test/ambientWorkspaceRefresh.testSupport';

import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

it('loads an ordinary committed body through the actual preload without a full list read', async () => {
  const unrelated = useWorkspaceStore.getState().nodesById.other;
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { await commit(); await vi.advanceTimersByTimeAsync(1500); });
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe(updated);
  expect(useWorkspaceStore.getState().nodesById.other).toBe(unrelated);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_projection')).toHaveLength(1);
  expect(origin.webContents.send).not.toHaveBeenCalled();
  expect(openDatabaseConnection().driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['topic'])?.content).toBe(updated);
  view.unmount(); vi.useRealTimers(); closeDatabaseConnection();
  const document = await invoke('load_node_document', { nodeId: 'topic' });
  expect(document).toMatchObject({ content: updated });
});


it('retains unsaved text and current navigation while another window commits', async () => {
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  markNodeContentEdited('topic');
  stagePendingNodeSync(createWorkspaceRuntimeNodeSnapshot({ ...useWorkspaceStore.getState().nodesById.topic!,
    content: 'Unsaved draft' }, 0), { optimistic: true });
  useWorkspaceStore.setState(state => ({ activeNodeId: 'other', nodesById: {
    ...state.nodesById, topic: { ...state.nodesById.topic!, content: 'Unsaved draft' }
  } }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { await commit(); await vi.advanceTimersByTimeAsync(1500); });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('other');
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Unsaved draft');
  expect(openDatabaseConnection().driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['topic'])?.content).toBe(updated);
  view.unmount();
});

it('keeps explicit full notifications and the existing failed-projection recovery', async () => {
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  controls.failProjection = true;
  await act(async () => { await commit(); await vi.advanceTimersByTimeAsync(1500); });
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe(updated);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(1);
  controls.failProjection = false; invoke.mockClear();
  await act(async () => { await commit('Retry body'); await vi.advanceTimersByTimeAsync(1500); });
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Retry body');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  invoke.mockClear();
  await act(async () => { notifyWorkspaceContentChanged(origin as never); await vi.advanceTimersByTimeAsync(1500); });
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(1);
  view.unmount();
});

it('rejects a delayed notification from a different library', async () => {
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => {
    notifyWorkspaceContentChanged(origin as never, { libraryScope: 'old-library',
      workspaceScope: { kind: 'nodes', nodeIds: ['topic'] } });
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(invoke.mock.calls.filter(([name]) => name.startsWith('load_workspace_list'))).toHaveLength(0);
  view.unmount();
});


it.each([false, true])('handles a later commit or library change during a real projection: switch=%s', async switchLibrary => {
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  let reached!: () => void; let release!: () => void;
  const reading = new Promise<void>(resolve => { reached = resolve; });
  controls.heldProjection = { reached, wait: new Promise<void>(resolve => { release = resolve; }) };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { await commit(); vi.advanceTimersByTime(1200); await reading; });
  let replacement: ReturnType<typeof useWorkspaceStore.getState> | undefined;
  if (switchLibrary) {
    useWorkspaceStore.setState({ libraryScope: 'replacement-library', activeNodeId: 'other' });
    replacement = useWorkspaceStore.getState();
  } else await act(async () => { await commit('Later committed body'); });
  await act(async () => { release(); await vi.advanceTimersByTimeAsync(1500); });
  if (switchLibrary) expect(useWorkspaceStore.getState()).toBe(replacement);
  else {
    expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Later committed body');
    expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_projection')).toHaveLength(2);
    expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  }
  view.unmount();
});
