import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { loadEditorOperationHistory, saveEditorOperationHistory } from '../../electron/database/editorOperationHistory.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { createEmptyEditorOperationHistory } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';

let appDataDir = '';
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
  })
}));


let root = '';

beforeEach(async () => {
  delete window.electronAPI;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-history-session-'));
  appDataDir = path.join(root, 'library');
  initializeDatabase();
  useWorkspaceStore.setState({ editorOperationHistory: createEmptyEditorOperationHistory(), isHydrated: false });
});

afterEach(async () => {
  delete window.electronAPI;
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('retires the old undo payload on library open without changing stored bodies or sync versions', async () => {
  const db = openDatabaseConnection().sqlite;
  const bodies = db.prepare('SELECT id, content FROM nodes ORDER BY id').all();
  const versions = db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  saveEditorOperationHistory('{"version":1,"old":"retired undo payload"}');
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadEditorOperationHistory()).toBeNull();
  const reopened = openDatabaseConnection().sqlite;
  expect(reopened.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(bodies);
  expect(reopened.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  await ensureWorkspaceHydrated();
  expect(useWorkspaceStore.getState().editorOperationHistory.sessionsByNodeId).toEqual({});
});

it('never writes a new history payload during current-session edits', async () => {
  useWorkspaceStore.getState().pushEditorOperationEntry(createTextHistoryEntry({
    nodeId: 'a', beforeContent: 'A', afterContent: 'AB'
  }));
  useWorkspaceStore.setState({ activeNodeId: 'b' });
  useWorkspaceStore.getState().pushEditorOperationEntry(createTextHistoryEntry({
    nodeId: 'b', beforeContent: 'B', afterContent: 'BC'
  }));
  await Promise.resolve();
  expect(loadEditorOperationHistory()).toBeNull();
  expect(useWorkspaceStore.getState().editorOperationHistory.sessionsByNodeId.a?.undoStack).toHaveLength(1);
  expect(useWorkspaceStore.getState().editorOperationHistory.sessionsByNodeId.b?.undoStack).toHaveLength(1);
});
