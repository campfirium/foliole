// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  })
}));

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  closeIosCompanionDatabase, getIosCompanionDatabaseOwner, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import {
  loadCompanionWorkspaceSyncState, saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { markCompanionNodeOpened } from './companionBrowseOpenState';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

let root = '';
let database: Database.Database | null = null;

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  const connection = { ...createFakeCapacitorConnection(sqlite), getUrl: async () => ({ url: file }) };
  const manager = {
    closeConnection: async () => { sqlite.close(); database = null; },
    createConnection: async () => connection,
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: existed }),
    retrieveConnection: async () => connection
  } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({
    booted_at: '2026-10-03T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Android mutation fixture', runtime_kind: 'android-capacitor'
  }, manager);
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-mutation-'));
  await openLibrary();
  await getIosCompanionDatabaseOwner().runWriter((db) => db.run(
    'INSERT INTO nodes (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['topic', 'Topic', 'topic', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z']
  ));
});

afterEach(async () => {
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

function surface(initial: NativeCompanionWorkspaceSyncState) {
  let current = initial;
  const setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>> = (next) => {
    current = typeof next === 'function' ? next(current) : next;
  };
  const actions = createWorkspaceSnapshotActions({
    state: initial, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}
  });
  return { actions, current: () => current, setState };
}

async function browse(initial: NativeCompanionWorkspaceSyncState, actions: ReturnType<typeof surface>['actions']) {
  await markCompanionNodeOpened({ nodeId: 'topic', snapshot: initial.workspace_snapshot,
    workspaceSync: actions as unknown as ReturnType<typeof useCompanionWorkspaceSync> });
}

it('keeps a newer sync endpoint when a previously opened page finishes a local operation', async () => {
  const initial = await saveCompanionWorkspaceSyncEndpoint('http://192.168.1.10:38641');
  const ui = surface(initial);
  const updated = await saveCompanionWorkspaceSyncEndpoint('http://192.168.1.20:38641');
  ui.setState(updated);
  await browse(initial, ui.actions);
  expect(ui.current().endpoint_url).toBe(updated.endpoint_url);
  expect(ui.current().remembered_targets).toEqual(updated.remembered_targets);
  expect(ui.current().workspace_snapshot?.nodeOpenStateById?.topic?.lastOpenedAt).toBeTruthy();
  await closeIosCompanionDatabase();
  await openLibrary();
  const reopened = await loadCompanionWorkspaceSyncState();
  expect(reopened.endpoint_url).toBe(updated.endpoint_url);
  expect(reopened.remembered_targets).toEqual(updated.remembered_targets);
  expect(reopened.workspace_snapshot?.nodeOpenStateById?.topic?.lastOpenedAt).toBeTruthy();
});

it('opens local content without creating or rewriting sync metadata', async () => {
  const initial = await loadCompanionWorkspaceSyncState();
  const before = database!.prepare('SELECT * FROM companion_meta ORDER BY key').all();
  const ui = surface(initial);
  await browse(initial, ui.actions);
  expect(ui.current().workspace_snapshot?.nodeOpenStateById?.topic?.lastOpenedAt).toBeTruthy();
  expect(database!.prepare('SELECT * FROM companion_meta ORDER BY key').all()).toEqual(before);
});
