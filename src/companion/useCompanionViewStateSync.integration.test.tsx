// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, renderHook } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ background: null as (() => void) | null }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async (handler: () => void) => {
    lifecycle.background = handler;
    return () => { lifecycle.background = null; };
  }
}));

import {
  closeIosCompanionDatabase,
  getIosCompanionDatabaseOwner,
  initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';

import { useCompanionViewStateSync } from './useCompanionViewStateSync';

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
    host_name: 'Android reading fixture', runtime_kind: 'android-capacitor'
  }, manager);
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-position-'));
  await openLibrary();
  await getIosCompanionDatabaseOwner().runWriter(async (db) => {
    for (const nodeId of ['one', 'two']) {
      await db.run('INSERT INTO nodes (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [nodeId, nodeId, 'topic', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z']);
    }
  });
  vi.useFakeTimers();
});

afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

function view(nodeId: string | null): Parameters<typeof useCompanionViewStateSync>[0] {
  return { activeAction: 'recent', readableArticleNodeId: nodeId,
    reviewNodeId: null, selectedBrowseNodeId: nodeId };
}

async function reopenSnapshot() {
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  await openLibrary();
  return getIosCompanionDatabaseOwner().read(loadIosCompanionWorkspaceSnapshot);
}

it('keeps both articles final positions through rapid navigation and database reopen', async () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => { hook.result.current(120); hook.result.current(340); });
  hook.rerender(view('two'));
  act(() => hook.result.current(85));
  hook.unmount();
  const snapshot = await reopenSnapshot();
  expect(snapshot?.persistedNodeViewById?.one?.scrollTop).toBe(340);
  expect(snapshot?.persistedNodeViewById?.two?.scrollTop).toBe(85);
  expect(snapshot?.activeNodeId).toBe('two');
  const records = await getIosCompanionDatabaseOwner().read((db) => db.query(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'view_state' AND sync_dirty = 1"
  ));
  expect(records).toHaveLength(3);
});

it('persists a background flush before its timer and restores it after reopening', async () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  await act(async () => {});
  act(() => { hook.result.current(512); lifecycle.background?.(); });
  await runCompanionSyncWriterTask(async () => undefined);
  expect(database!.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('one')).toBe(512);
  hook.unmount();
  const snapshot = await reopenSnapshot();
  expect(snapshot?.persistedNodeViewById?.one).toMatchObject({ scrollTop: 512, source: 'user-scroll' });
});

it('leaves no partial state on a write failure and saves the next position after recovery', async () => {
  database!.exec(`CREATE TRIGGER reject_position BEFORE INSERT ON node_view_state
    BEGIN SELECT RAISE(ABORT, 'temporary write failure'); END`);
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  await act(async () => { hook.result.current(100); await vi.advanceTimersByTimeAsync(800); });
  await runCompanionSyncWriterTask(async () => undefined);
  expect(database!.prepare('SELECT count(*) FROM node_view_state').pluck().get()).toBe(0);
  database!.exec('DROP TRIGGER reject_position');
  act(() => hook.result.current(220));
  hook.unmount();
  const snapshot = await reopenSnapshot();
  expect(snapshot?.persistedNodeViewById?.one?.scrollTop).toBe(220);
});


it('keeps the newest position when earlier writes are still queued', async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const blocked = runCompanionSyncWriterTask(() => barrier);
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  try {
    act(() => { hook.result.current(100); vi.advanceTimersByTime(800); });
    act(() => hook.result.current(230));
    hook.rerender(view('two'));
    hook.rerender(view('one'));
    act(() => hook.result.current(460));
    hook.unmount();
  } finally {
    release();
    await blocked;
  }
  const snapshot = await reopenSnapshot();
  expect(snapshot?.persistedNodeViewById?.one?.scrollTop).toBe(460);
});

it('keeps ordinary debounced writes through database reopen', async () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => { hook.result.current(100); vi.advanceTimersByTime(400); hook.result.current(280); });
  await runCompanionSyncWriterTask(async () => undefined);
  expect(database!.prepare('SELECT count(*) FROM node_view_state').pluck().get()).toBe(0);
  act(() => vi.advanceTimersByTime(800));
  await runCompanionSyncWriterTask(async () => undefined);
  expect(database!.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('one')).toBe(280);
  hook.unmount();
  expect((await reopenSnapshot())?.persistedNodeViewById?.one?.scrollTop).toBe(280);
});
