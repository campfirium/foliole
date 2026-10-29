import fs from 'node:fs/promises';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '', windows: [] as unknown[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => host.windows } }));
vi.mock('../../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: host.root, app_cache_dir: host.root, app_config_dir: host.root, app_log_dir: host.root
}) }));
vi.mock('../../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('../../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { upsertVersionedNodeSnapshot } from '../../../electron/database/nodeVersionedMutations.js';
import { saveReadingProgress } from '../../../electron/database/readingProgress.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { notifyWorkspaceContentChanged } from '../../../electron/ipc/workspaceContentChangedEvents.js';
import { executePreload } from '../../../electron/preload.testSupport.js';
import type { WorkspaceContentChangedPayload } from '../../shared/platform/electronApi';
import { stagePendingNodeSync, resolvePendingNodeSync } from '../../shared/platform/workspacePendingNodeSync';
import { createWorkspaceRuntimeNodeSnapshot } from '../../shared/platform/workspaceRuntimeRepository';
import { markNodeContentEdited, resetNodeContentVersionGuardForTests } from '../../store/workspaceNodeContentVersionGuard';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

const original = '\ufeffOriginal\r\n原文 😀\r\n';
const updated = '\ufeffChanged\r\n新文 😀\r\n';
const listeners = new Set<(payload: WorkspaceContentChangedPayload) => void>();
const origin = { isDestroyed: () => false, webContents: { send: vi.fn() } };
const receiver = { isDestroyed: () => false, webContents: { send: (channel: string, payload: WorkspaceContentChangedPayload) => {
  if (channel === 'foliole:workspace-content-changed') for (const listener of listeners) listener(payload);
} } };
let failProjection = false;
let heldProjection: { reached: () => void; wait: Promise<void> } | null = null;
const invoke = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
  if (failProjection && command === 'load_workspace_list_projection') throw new Error('Interrupted projection');
  const result = await handleStorageCommand(command, args, receiver as never);
  if (command === 'load_workspace_list_projection' && heldProjection) {
    const held = heldProjection; heldProjection = null; held.reached(); await held.wait;
  }
  return result;
});

beforeEach(async () => {
  await fs.mkdir('.tmp/artifacts/T625', { recursive: true });
  host.root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T625/library-'));
  host.windows = [origin, receiver];
  listeners.clear();
  failProjection = false; heldProjection = null;
  invoke.mockClear();
  origin.webContents.send.mockClear();
  const preload = executePreload();
  const deliveries = new Map<(...args: unknown[]) => void, (payload: WorkspaceContentChangedPayload) => void>();
  preload.ipcOn.mockImplementation((channel, listener) => {
    if (channel !== 'foliole:workspace-content-changed') return;
    const deliver = (payload: WorkspaceContentChangedPayload) => listener({}, payload);
    deliveries.set(listener, deliver); listeners.add(deliver);
  });
  preload.ipcRemoveListener.mockImplementation((_channel, listener) => {
    const deliver = deliveries.get(listener); if (deliver) listeners.delete(deliver);
  });
  preload.ipcInvoke.mockImplementation((_channel, request) => invoke(request.command, request.args));
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: preload.exposeInMainWorld.mock.calls[0]?.[1] });
  initializeDatabase();
  for (const id of ['topic', 'other']) upsertVersionedNodeSnapshot({ nodeId: id, kind: 'topic', title: id,
    content: original, parentNodeId: null, position: null, isTitleManual: true, anchorLink: null,
    reveal: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' });
  saveReadingProgress({ activeNodeId: 'topic', updatedAt: new Date().toISOString(), nodeViewStates: [] });
  useWorkspaceStore.setState(createInitialWorkspaceState());
  await useWorkspaceStore.persist.rehydrate();
  useWorkspaceStore.setState({ activeNodeId: 'topic' });
  invoke.mockClear();
});

afterEach(async () => {
  resolvePendingNodeSync('topic', '2026-10-01T00:00:00Z');
  vi.useRealTimers(); resetNodeContentVersionGuardForTests(); listeners.clear(); host.windows = [];
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  closeDatabaseConnection(); await fs.rm(host.root, { recursive: true, force: true });
});

async function commit(content = updated) {
  const current = useWorkspaceStore.getState().nodesById.topic!;
  await handleStorageCommand('update_node_content_with_anchors', {
    parent: { nodeId: 'topic', kind: 'topic', title: 'topic', content, parentNodeId: null,
      position: null, isTitleManual: true, anchorLink: null, reveal: null,
      createdAt: current.createdAt, updatedAt: new Date().toISOString() }, affectedAnchors: []
  }, origin as never);
}

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
  failProjection = true;
  await act(async () => { await commit(); await vi.advanceTimersByTimeAsync(1500); });
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe(updated);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(1);
  failProjection = false; invoke.mockClear();
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
  heldProjection = { reached, wait: new Promise<void>(resolve => { release = resolve; }) };
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
