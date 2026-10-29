import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '', windows: [] as unknown[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => host.windows } }));
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(host.root, 'cache'),
    app_config_dir: path.join(host.root, 'config'), app_data_dir: host.root,
    app_log_dir: path.join(host.root, 'logs') })
}));
vi.mock('../../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { saveImportManagerSettings } from '../../../electron/import/importManagerSettings.js';
import { runKeepImportRule } from '../../../electron/import/keepImportService.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { executePreload } from '../../../electron/preload.testSupport.js';
import type { WorkspaceContentChangedPayload } from '../../shared/platform/electronApi';
import { onWorkspaceContentChanged } from '../../shared/platform/runtimeShellEvents';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { createReimportSelectedTopicCommand } from './appPaletteReimportCommand';
import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

let tempRoot = '';
let deferOriginNotification = false;
const deferredNotifications: WorkspaceContentChangedPayload[] = [];
const listeners = new Set<(payload: WorkspaceContentChangedPayload) => void>();
const origin = { isDestroyed: () => false, webContents: { send: (channel: string, payload: WorkspaceContentChangedPayload) => {
  if (channel !== 'foliole:workspace-content-changed') return;
  if (deferOriginNotification) deferredNotifications.push(payload);
  else for (const listener of listeners) listener(payload);
} } };
const other = { isDestroyed: () => false, webContents: { send: vi.fn() } };
const invoke = vi.fn(async (command: string, args: Record<string, unknown> = {}) =>
  handleStorageCommand(command, args, origin as never));

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reimport-completion-'));
  host.root = path.join(tempRoot, 'data');
  host.windows = [origin, other];
  listeners.clear();
  deferOriginNotification = false;
  deferredNotifications.length = 0;
  invoke.mockClear();
  other.webContents.send.mockClear();
  const preload = executePreload();
  const deliveries = new Map<(...args: unknown[]) => void, (payload: WorkspaceContentChangedPayload) => void>();
  preload.ipcOn.mockImplementation((channel, listener) => {
    if (channel !== 'foliole:workspace-content-changed') return;
    const deliver = (payload: WorkspaceContentChangedPayload) => listener({}, payload);
    deliveries.set(listener, deliver);
    listeners.add(deliver);
  });
  preload.ipcRemoveListener.mockImplementation((_channel, listener) => {
    const deliver = deliveries.get(listener);
    if (deliver) listeners.delete(deliver);
  });
  preload.ipcInvoke.mockImplementation((_channel, request) => invoke(request.command, request.args));
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: preload.exposeInMainWorld.mock.calls[0]?.[1] });
  initializeDatabase();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date()));
});

afterEach(async () => {
  vi.useRealTimers();
  listeners.clear();
  host.windows = [];
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createWatchedTopic() {
  const source = path.join(tempRoot, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'topic.md'), '# Watched\n\nOriginal body\n');
  saveImportManagerSettings({ sources: [{ actionMode: 'keep', archivePath: '', highlightMode: 'merged',
    highlightPath: '', id: 'completion-source', keepPreview: null, keepState: 'enabled', primaryPath: source }] });
  await runKeepImportRule({ directoryPath: source, highlightPolicy: 'adopt', ruleId: 'completion-source' });
  const row = openDatabaseConnection().driver.queryOne<{ last_node_id: string }>(
    'SELECT last_node_id FROM keep_import_items WHERE rule_id = ?', ['completion-source']);
  if (!row) throw new Error('watched topic missing');
  await useWorkspaceStore.persist.rehydrate();
  return { source, nodeId: row.last_node_id };
}

it.each([false, true])('rebuilds once with delayed origin delivery=%s and reloads persisted text', async delayed => {
  const { source, nodeId } = await createWatchedTopic();
  await fs.writeFile(path.join(source, 'topic.md'), '# Watched\n\nFresh body\n');
  const auxiliary = vi.fn();
  const unsubscribe = await onWorkspaceContentChanged(auxiliary);
  const hook = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  invoke.mockClear();
  deferOriginNotification = delayed;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const command = createReimportSelectedTopicCommand({ ws: { activeNodeId: nodeId },
    runtime: { isViewingTrashNode: false, flushPendingEditorDraftImmediately: async () => true } });
  await act(async () => { expect(await command()).toBe(true); });
  act(() => {
    for (const payload of deferredNotifications.splice(0)) for (const listener of listeners) listener(payload);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(1);
  expect(auxiliary).toHaveBeenCalledOnce();
  expect(other.webContents.send).toHaveBeenCalledWith('foliole:workspace-content-changed', expect.objectContaining({ scope: 'workspace', workspaceScope: { kind: 'full' } }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe(nodeId);
  expect(useWorkspaceStore.getState().nodesById[nodeId]?.content).toBe('# Watched\n\nFresh body\n');
  hook.unmount();
  unsubscribe?.();
  vi.useRealTimers();
  closeDatabaseConnection();
  await useWorkspaceStore.persist.rehydrate();
  expect(useWorkspaceStore.getState().nodesById[nodeId]).toBeDefined();
  const document = await invoke('load_node_document', { nodeId });
  expect(document).toMatchObject({ content: '# Watched\n\nFresh body\n' });
});

it('reports a failed workspace rebuild and permits a later reimport to recover persisted results', async () => {
  const { source, nodeId } = await createWatchedTopic();
  await fs.writeFile(path.join(source, 'topic.md'), '# Watched\n\nRetry body\n');
  let rejectNextSnapshot = true;
  invoke.mockImplementation(async (command, args = {}) => {
    if (command === 'load_workspace_list_snapshot' && rejectNextSnapshot) {
      rejectNextSnapshot = false;
      throw new Error('Workspace read interrupted');
    }
    return handleStorageCommand(command, args, origin as never);
  });
  const command = createReimportSelectedTopicCommand({ ws: { activeNodeId: nodeId },
    runtime: { isViewingTrashNode: false, flushPendingEditorDraftImmediately: async () => true } });
  await expect(command()).rejects.toThrow('Workspace read interrupted');
  await expect(command()).resolves.toBe(true);
  expect(useWorkspaceStore.getState().nodesById[nodeId]?.content).toBe('# Watched\n\nRetry body\n');
});
