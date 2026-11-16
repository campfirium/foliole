import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { vi } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver';
import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { initializeDatabase } from '../../electron/database/migrate';
import { drainDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersionDrain';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../../electron/database/nodeTrashTransitions';
import { moveNodes } from '../../lib/core/database/nodeMoveMutations';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { createAwaitedWorkspaceHistoryActions, createEmptyWorkspaceActionHistory,
  createWorkspaceActionHistoryActions } from '../store/workspaceActionHistory';
import { createApplicationHistory } from '../store/workspaceApplicationHistory';
import { createApplicationHistoryActions } from '../store/workspaceApplicationHistoryActions';
import { publishApplicationHistories } from '../store/workspaceApplicationHistoryPublish';
import { projectApplicationWorkspaceHistory } from '../store/workspaceApplicationWorkspaceHistory';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from '../store/workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from '../store/workspaceStore';
import { withWorkspaceRendererBoundary } from '../store/workspaceStoreRendererBoundary';
import { createRestoreNodeAction } from '../store/workspaceStoreRestoreAction';
import { createDeleteNodesAction } from '../store/workspaceStoreStructureDeleteAction';
import { createMoveNodesAction } from '../store/workspaceStoreTreeActions';
import { mergeWorkspaceSyncProjection } from '../store/workspaceSyncProjectionMerge';

const now = '2026-11-16T08:00:00.000Z';
let appDataDir = '';
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../../electron/ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../electron/foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

export function createTrashLifecycleHarness(application = false, subtree = false, persistedTrash = false) {
  const directory = mkdtempSync(path.join(tmpdir(), 'foliole-trash-lifecycle-'));
  appDataDir = directory;
  initializeDatabase();
  const { driver, dbPath: file } = openDatabaseConnection();
  driver.execute("INSERT OR REPLACE INTO settings VALUES ('host_name', ?, ?)", ['"trash-lifecycle"', now]);
  bindParentOrderWriter(driver, { deviceAnchor: 'trash-lifecycle', libraryPath: file });
  const seeds: Array<[string, string | null]> = [['deleted', null], ['source', null], ['target', null]];
  if (subtree) seeds.push(['child', 'deleted']);
  for (const [id, parent] of seeds) driver.execute(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'folder', ?, '', ?, ?, ?)`, [id, parent, id, now, now,
    persistedTrash && id === 'deleted' ? now : null]);
  const snapshot = loadWorkspaceSnapshot(driver)!;
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(),
    ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
      [id, { ...node, anchorLink: null }])), isHydrated: true, appActionHistory: createEmptyWorkspaceActionHistory() };
  const get = () => state;
  const set = (partial: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    if (patch !== state) state = { ...state,
      ...withWorkspaceRendererBoundary(publishApplicationHistories(patch, state), state) };
  };
  const handlers = { ...createBrowserLocalWorkspaceMutationRepository(),
    syncNodeContent: () => { throw new Error('unexpected_content_write'); },
    syncSoftDeleteNodes: async (payload: Parameters<typeof softDeleteNodesWithParents>[0]) => {
      softDeleteNodesWithParents(payload);
      return { deletedNodeIds: payload.nodeIds };
    },
    syncRestoreNodes: async (payload: Parameters<typeof restoreNodesWithParents>[0]) => restoreNodesWithParents(payload),
    syncMoveNodes: async (payload: Parameters<typeof moveNodes>[1]) => moveNodes(driver, payload) };
  installWorkspaceMutationRepository(handlers);
  const applicationActions = createApplicationHistoryActions(set, get);
  set({ ...createWorkspaceActionHistoryActions(set, get), ...applicationActions,
    ...(application ? { appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory,
      createApplicationHistory()) } : {}) });
  const restore = createRestoreNodeAction(set, handlers);
  set({ restoreNode: restore });
  return { driver, get, set, handlers, applicationActions,
    remove: createDeleteNodesAction(set, handlers, get), restore,
    removeWithoutHistory: createDeleteNodesAction(set, handlers),
    move: createMoveNodesAction(set, handlers.syncMoveNodes),
    history: createAwaitedWorkspaceHistoryActions(set, get),
    refresh: (nodeIds = ['source', 'target']) => set(mergeWorkspaceSyncProjection(state,
      loadWorkspaceListProjection(driver, { nodeIds, structure: true }))),
    persisted: () => {
      const reopened = new Database(file, { readonly: true });
      try { return loadWorkspaceSnapshot(createBetterSqlite3Driver(reopened))!; }
      finally { reopened.close(); }
    },
    close: async () => { resetWorkspaceMutationRepository(); await drainDirtyNodeSyncVersions();
      closeDatabaseConnection(); rmSync(directory, { recursive: true }); }
  };
}
