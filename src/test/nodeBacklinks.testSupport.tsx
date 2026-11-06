import fs from 'node:fs/promises';
import path from 'node:path';

import { act } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '', windows: [] as unknown[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => host.windows } }));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: host.root, app_cache_dir: host.root, app_config_dir: host.root, app_log_dir: host.root
}) }));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('../../electron/ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../../electron/database/releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { drainDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersionDrain.js';
import { handleStorageCommand } from '../../electron/ipc/storageCommands.js';
import { executePreload } from '../../electron/preload.testSupport.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import { WorkspaceRightSidebarBacklinksPanel } from '../app/components/WorkspaceRightSidebarBacklinksPanel';
import type { Node } from '../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

function peer() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return { listeners, isDestroyed: () => false, webContents: { send(channel: string, payload: unknown) {
    for (const listener of listeners.get(channel) ?? []) listener(payload);
  } } };
}
export const writer = peer();
export const reader = peer();
const now = '2026-11-06T00:00:00.000Z';
export const snapshot = (nodeId: string, title: string, content = '') => ({ nodeId, title, content,
  kind: 'topic' as const, parentNodeId: null, position: null, isTitleManual: true, anchorLink: null,
  reveal: null, createdAt: now, updatedAt: new Date().toISOString() });

export function installBridge(owner = reader) {
  const preload = executePreload();
  const deliveries = new Map<(...args: unknown[]) => void, (payload: unknown) => void>();
  preload.ipcOn.mockImplementation((channel, callback) => {
    const deliver = (payload: unknown) => callback({}, payload);
    deliveries.set(callback, deliver);
    const listeners = owner.listeners.get(channel) ?? new Set();
    listeners.add(deliver); owner.listeners.set(channel, listeners);
  });
  preload.ipcRemoveListener.mockImplementation((channel, callback) => {
    const deliver = deliveries.get(callback); if (deliver) owner.listeners.get(channel)?.delete(deliver);
  });
  preload.ipcInvoke.mockImplementation((_channel, request) => handleStorageCommand(request.command, request.args, owner as never));
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: preload.exposeInMainWorld.mock.calls[0]?.[1] });
}

export async function mutate(command: string, args: Record<string, unknown>, owner = writer) {
  await act(async () => { await handleStorageCommand(command, args, owner as never); });
}
export const save = (nodeId: string, title: string, content: string, owner = writer) =>
  mutate(NATIVE_COMMANDS.updateNodeContent, snapshot(nodeId, title, content), owner);

export function persisted(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ title: string; content: string; deleted_at: string | null }>(
    'SELECT title, content, deleted_at FROM nodes WHERE id = ?', [nodeId]);
}

export function panel(owner = reader) {
  installBridge(owner);
  const select = vi.fn();
  const target: Node = { id: 'target', title: 'Target', content: '', kind: 'topic',
    parentNodeId: null, anchorLink: null, reveal: null, review: null, createdAt: now, updatedAt: now };
  const view = renderWithLocalization(<WorkspaceRightSidebarBacklinksPanel activeNodeId="target"
    nodeOrder={['target']} nodesById={{ target }} onSelectNode={select} trashedNodeIds={[]} />);
  return { ...view, select };
}

beforeEach(async () => {
  await fs.mkdir('.tmp/artifacts/T732-2', { recursive: true });
  host.root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T732-2/library-'));
  writer.listeners.clear(); reader.listeners.clear(); host.windows = [writer, reader];
  initializeDatabase();
  await handleStorageCommand(NATIVE_COMMANDS.createTopic, snapshot('target', 'Target'));
  await handleStorageCommand(NATIVE_COMMANDS.createTopic, snapshot('source', 'Source'));
  useWorkspaceStore.setState(createInitialWorkspaceState());
  installBridge();
  await useWorkspaceStore.persist.rehydrate();
});

afterEach(async () => {
  writer.listeners.clear(); reader.listeners.clear(); host.windows = [];
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  await drainDirtyNodeSyncVersions('foreground');
  closeDatabaseConnection(); await fs.rm(host.root, { recursive: true, force: true });
});
