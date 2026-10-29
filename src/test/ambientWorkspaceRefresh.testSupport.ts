import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '', windows: [] as unknown[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => host.windows } }));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: host.root, app_cache_dir: host.root, app_config_dir: host.root, app_log_dir: host.root
}) }));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('../../electron/ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../electron/database/releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));
vi.mock('../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { drainDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersionDrain.js';
import { upsertVersionedNodeSnapshot } from '../../electron/database/nodeVersionedMutations.js';
import { saveReadingProgress } from '../../electron/database/readingProgress.js';
import { handleStorageCommand } from '../../electron/ipc/storageCommands.js';
import { executePreload } from '../../electron/preload.testSupport.js';
import type { WorkspaceContentChangedPayload } from '../shared/platform/electronApi';
import { resolvePendingNodeSync } from '../shared/platform/workspacePendingNodeSync';
import { resetNodeContentVersionGuardForTests } from '../store/workspaceNodeContentVersionGuard';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';


export const original = '\ufeffOriginal\r\n原文 😀\r\n';
export const updated = '\ufeffChanged\r\n新文 😀\r\n';
const listeners = new Set<(payload: WorkspaceContentChangedPayload) => void>();
export const origin = { isDestroyed: () => false, webContents: { send: vi.fn() } };
const receiver = { isDestroyed: () => false, webContents: { send: (channel: string, payload: WorkspaceContentChangedPayload) => {
  if (channel === 'foliole:workspace-content-changed') for (const listener of listeners) listener(payload);
} } };
export const controls = { failProjection: false, heldProjection: null as { reached: () => void; wait: Promise<void> } | null };
export const invoke = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
  if (controls.failProjection && command === 'load_workspace_list_projection') throw new Error('Interrupted projection');
  const result = await handleStorageCommand(command, args, receiver as never);
  if (command === 'load_workspace_list_projection' && controls.heldProjection) {
    const held = controls.heldProjection; controls.heldProjection = null; held.reached(); await held.wait;
  }
  return result;
});

beforeEach(async () => {
  await fs.mkdir('.tmp/artifacts/T625', { recursive: true });
  host.root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T625/library-'));
  host.windows = [origin, receiver];
  listeners.clear();
  controls.failProjection = false; controls.heldProjection = null;
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
  await drainDirtyNodeSyncVersions('foreground');
  closeDatabaseConnection(); await fs.rm(host.root, { recursive: true, force: true });
});

export async function commit(content = updated) {
  const current = useWorkspaceStore.getState().nodesById.topic!;
  await handleStorageCommand('update_node_content_with_anchors', {
    parent: { nodeId: 'topic', kind: 'topic', title: 'topic', content, parentNodeId: null,
      position: null, isTitleManual: true, anchorLink: null, reveal: null,
      createdAt: current.createdAt, updatedAt: new Date().toISOString() }, affectedAnchors: []
  }, origin as never);
}
