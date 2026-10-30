// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub
  };
});

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import {
  loadCompanionWorkspaceSyncState
} from '../shared/platform/companionWorkspaceSync';

import { CompanionReadingActivity } from './companionReadingActivity';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { createFloatingBar } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

let root = '';
let database: Database.Database | null = null;

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  const manager = createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; });
  await initializeIosCompanionDatabase({
    booted_at: '2026-10-03T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Android mutation fixture', runtime_kind: 'android-capacitor'
  }, manager);
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-reading-recovery-'));
  await openLibrary();
  const insert = database!.prepare(
    'INSERT INTO nodes (id, parent_id, title, kind, sequential_reading_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const now = '2026-05-01T00:00:00.000Z';
  insert.run('inbox', null, 'Inbox', 'folder', 0, now, now);
  insert.run('source', 'inbox', 'Source', 'topic', 1, now, now);
  insert.run('first', 'source', 'First', 'topic', 0, now, now);
  insert.run('last', 'source', 'Last', 'topic', 0, now, now);
  database!.exec("UPDATE nodes SET content = '# Reading topic' WHERE id IN ('first', 'last')");
  for (const nodeId of ['first', 'last']) {
    await saveCompanionSyncNodeReadingRecord({ nodeId, reading: {
      intervalDurationMs: 1000, intervalGrowthFactor: 1, lastHandledAt: now,
      nextAt: now, priority: 5, readingPosition: 0, repetitionCount: 0,
      state: nodeId === 'first' ? 'active' : 'locked'
    } });
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

function renderSurface(initial: NativeCompanionWorkspaceSyncState) {
  return renderHook(() => {
    const [state, setState] = useState(initial);
    const actions = createWorkspaceSnapshotActions({
      state, setState, setError: () => {}, setStatus: () => {},
      setSyncConflictCount: () => {}, setSyncProgress: () => {}
    });
    const snapshot = state.workspace_snapshot;
    const flow = useCompanionFlowSession({ snapshot, ready: true, active: true, onlyReview: false,
      libraryScope: snapshot?.libraryScope ?? 'test' });
    const activity = useMemo(() => new CompanionReadingActivity(flow.view.currentCard?.nodeId ?? null, () => {}),
      [flow.view.currentCard?.nodeId]);
    const session = flow.view;
    const handlers = useCompanionSurfaceActions({
      floatingBar: createFloatingBar(), flow, activity, active: true, snapshot,
      workspaceSync: { ...actions, state } as ReturnType<typeof useCompanionWorkspaceSync>
    });
    return { ...handlers, state, session, reveal: flow.reveal };
  });
}

function failReadingWrite(nodeId: string) {
  database!.exec(`CREATE TRIGGER fail_reading BEFORE INSERT ON node_reading
    WHEN NEW.node_id = '${nodeId}' BEGIN SELECT RAISE(ABORT, 'reading storage failure'); END`);
}

it('rolls back both reading records after a related write fails and retries after reopening', async () => {
  const initial = await loadCompanionWorkspaceSyncState();
  const ui = renderSurface(initial);
  await waitFor(() => expect(ui.result.current.session.currentCard).not.toBeNull());
  expect(ui.result.current.session.currentCard?.nodeId).toBe('first');
  failReadingWrite('last');
  await act(() => ui.result.current.handleDismissReviewTopic());
  const stored = await loadCompanionWorkspaceSyncState();
  expect(stored.workspace_snapshot?.nodesById.first?.reading?.state).toBe('active');
  expect(stored.workspace_snapshot?.nodesById.last?.reading?.state).toBe('locked');
  expect(ui.result.current.readingError).toBeTruthy();
  expect(ui.result.current.state.workspace_snapshot).toEqual(stored.workspace_snapshot);
  const rows = database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
  await act(() => ui.result.current.handleDismissReviewTopic());
  expect(database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(rows);
  database!.exec('DROP TRIGGER fail_reading');
  ui.unmount();
  await closeIosCompanionDatabase();
  await openLibrary();
  const reopened = await loadCompanionWorkspaceSyncState();
  expect(reopened.workspace_snapshot?.nodesById.first?.reading?.state).toBe('active');
  expect(reopened.workspace_snapshot?.nodesById.last?.reading?.state).toBe('locked');
  const reopenedUi = renderSurface(reopened);
  await waitFor(() => expect(reopenedUi.result.current.session.currentCard?.nodeId).toBe('first'));
  await act(() => reopenedUi.result.current.handleDismissReviewTopic());
  expect(reopenedUi.result.current.readingError).toBeNull();
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.first?.reading?.state).toBe('dismissed');
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.last?.reading?.state).toBe('active');
  reopenedUi.unmount();
});

it('allows retry after the first write fails without advancing either topic', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState());
  await waitFor(() => expect(ui.result.current.session.currentCard).not.toBeNull());
  failReadingWrite('first');
  await act(() => ui.result.current.handleDismissReviewTopic());
  expect(ui.result.current.session.currentCard?.nodeId).toBe('first');
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.first?.reading?.state).toBe('active');
  database!.exec('DROP TRIGGER fail_reading');
  await act(() => ui.result.current.handleDismissReviewTopic());
  expect(ui.result.current.readingError).toBeNull();
  expect(ui.result.current.state.workspace_snapshot?.nodesById.first?.reading?.state).toBe('dismissed');
  expect(ui.result.current.state.workspace_snapshot?.nodesById.last?.reading?.state).toBe('active');
  ui.unmount();
});

it('recovers a failed refresh after a committed save without repeating the mutation', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState());
  await waitFor(() => expect(ui.result.current.session.currentCard).not.toBeNull());
  const originalRefresh = workspaceRepository.refreshCompanionWorkspaceAfterMutation;
  let refreshError: string | null = 'Read unavailable';
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockImplementation((...args) => {
    const saved = database!.prepare("SELECT state FROM node_reading WHERE node_id='first'").get() as { state: string } | undefined;
    if (refreshError && saved?.state === 'dismissed') {
      const error = refreshError;
      refreshError = null;
      return Promise.reject(new Error(error));
    }
    return originalRefresh(...args);
  });
  await act(() => ui.result.current.handleDismissReviewTopic());
  expect(ui.result.current.readingError).toBeTruthy();
  expect(ui.result.current.session.currentCard?.nodeId).toBe('first');
  const rows = database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
  expect(rows).toContainEqual(expect.objectContaining({ node_id: 'first', state: 'dismissed' }));
  refreshError = 'Read still unavailable';
  await act(() => ui.result.current.handleReadReviewTopic());
  expect(ui.result.current.readingError).toBeTruthy();
  expect(database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(rows);
  await act(() => ui.result.current.handleReadReviewTopic());
  expect(ui.result.current.readingError).toBeNull();
  expect(ui.result.current.session.currentCard?.nodeId).not.toBe('first');
  expect(database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(rows);
  expect(ui.result.current.state.workspace_snapshot).toEqual((await loadCompanionWorkspaceSyncState()).workspace_snapshot);
  ui.unmount();
});
