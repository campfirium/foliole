// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'dive-flow-delete', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: tempRoot,
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'open_daily_flow') {
    const { openDesktopDailyFlow } = await import('../../electron/database/dailyFlow');
    return openDesktopDailyFlow(args);
  }
  return null;
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { createDive } from '../../electron/database/diveRepository';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { drainDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersionDrain';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../../electron/database/nodeTrashTransitions';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';

import { createApplicationHistory } from './workspaceApplicationHistory';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createQaNode } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dive-flow-delete-'));
  initializeDatabase();
});
afterEach(async () => {
  resetWorkspaceMutationRepository();
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function openDiveLibrary(application: boolean) {
  const insert = (id: string, kind: 'topic' | 'item', parentNodeId: string | null) => {
    const node = createQaNode(id, now);
    upsertNodeSnapshot({ nodeId: id, title: id, kind, parentNodeId, content: node.content,
      reveal: kind === 'item' ? node.reveal : null, review: null, isTitleManual: true, anchorLink: null,
      position: 0, createdAt: now, updatedAt: now });
  };
  insert('source', 'topic', null);
  insert('first', 'item', 'source');
  insert('second', 'item', 'source');
  const { sqlite } = openDatabaseConnection();
  const dive = createDive(sqlite, 'Test Dive', ['source']);
  installWorkspaceMutationRepository({ ...createBrowserLocalWorkspaceMutationRepository(),
    syncSoftDeleteNodes: async payload => { softDeleteNodesWithParents(payload); return { deletedNodeIds: payload.nodeIds }; },
    syncRestoreNodes: async payload => restoreNodesWithParents(payload) });
  const snapshot = loadWorkspaceSnapshot()!;
  const clean = createInitialWorkspaceState();
  useWorkspaceStore.setState({ ...clean, ...snapshot, isHydrated: true,
    nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) => [id, { ...node, anchorLink: null }])),
    ...(application ? { appActionHistory: projectApplicationWorkspaceHistory(clean.appActionHistory, createApplicationHistory()) } : {}) });
  return dive;
}

// The desktop app keeps application history; the browser build keeps workspace history.
it.each([true, false])('moves a Dive on when its current card is deleted and keeps it through undo and redo (%s)', async application => {
  const dive = openDiveLibrary(application);
  const state = () => useWorkspaceStore.getState();
  expect(await state().startReviewSession(now, { dive: { id: dive.id, topicIds: ['source'] } })).toBeTruthy();
  const current = state().reviewSession.currentNodeId!;
  expect(['first', 'second']).toContain(current);
  const other = current === 'first' ? 'second' : 'first';

  await state().deleteNodes([current]);
  await vi.waitFor(() => expect(state().reviewSession.currentNodeId).toBe(other));
  expect(state().reviewSession.dive?.id).toBe(dive.id);

  expect(application ? state().undoApplicationOperation?.() : state().undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(state().trashedNodeIds).not.toContain(current));
  expect(state().reviewSession.dive?.id).toBe(dive.id);
  expect(['first', 'second']).toContain(state().reviewSession.currentNodeId);

  expect(application ? state().redoApplicationOperation?.() : state().redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(state().trashedNodeIds).toContain(current));
  await vi.waitFor(() => expect(state().reviewSession.currentNodeId).toBe(other));
  expect(state().reviewSession.dive?.id).toBe(dive.id);
});
