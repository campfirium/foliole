// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  })
}));

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
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
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-grade-recovery-'));
  await openLibrary();
  const insert = database!.prepare(
    'INSERT INTO nodes (id, parent_id, title, kind, sequential_reading_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const now = '2026-05-01T00:00:00.000Z';
  insert.run('inbox', null, 'Inbox', 'folder', 0, now, now);
  insert.run('card', 'inbox', 'Card', 'item', 0, now, now);
  await saveCompanionSyncNodeReviewRecord({ nodeId: 'card', review: {
    difficulty: 4.2, due: now, elapsedDays: 2, lapses: 0,
    lastReviewAt: now, reps: 3, scheduledDays: 2, stability: 2.1, state: 2
  } });
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

function storedGrade() {
  return {
    review: database!.prepare('SELECT * FROM node_review').all(),
    logs: database!.prepare('SELECT * FROM review_log').all()
  };
}

it('retries only the read after a saved grade, preserving its log and schedule through reopen', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState());
  await waitFor(() => expect(ui.result.current.session.currentCard).not.toBeNull());
  expect(ui.result.current.session.currentCard?.nodeId).toBe('card');
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation');
  refresh.mockResolvedValueOnce(ui.result.current.state.workspace_snapshot);
  refresh.mockRejectedValueOnce(new Error('Read unavailable'));
  act(() => ui.result.current.reveal());
  await act(() => ui.result.current.handleGradeReview(3));
  expect(ui.result.current.reviewError).toBeTruthy();
  expect(ui.result.current.session.currentCard?.nodeId).toBe('card');
  const saved = storedGrade();
  expect(saved.logs).toHaveLength(1);
  const stored = await loadCompanionWorkspaceSyncState();
  expect(stored.workspace_snapshot?.nodesById.card?.review?.due).not.toBe('2026-05-01T00:00:00.000Z');
  refresh.mockRejectedValueOnce(new Error('Read still unavailable'));
  act(() => ui.result.current.reveal());
  await act(() => ui.result.current.handleGradeReview(1));
  expect(ui.result.current.reviewError).toBeTruthy();
  expect(storedGrade()).toEqual(saved);
  act(() => ui.result.current.reveal());
  await act(() => ui.result.current.handleGradeReview(4));
  expect(ui.result.current.reviewError).toBeNull();
  expect(ui.result.current.state.workspace_snapshot).toEqual(stored.workspace_snapshot);
  expect(storedGrade()).toEqual(saved);
  ui.unmount();
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(storedGrade()).toEqual(saved);
  const reopened = renderSurface(await loadCompanionWorkspaceSyncState());
  expect(reopened.result.current.state.workspace_snapshot).toEqual(stored.workspace_snapshot);
  expect(reopened.result.current.session.currentCard).toBeNull();
  reopened.unmount();
});

it('rolls back a failed log insert and permits a fresh grade retry', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState());
  await waitFor(() => expect(ui.result.current.session.currentCard).not.toBeNull());
  const before = storedGrade();
  database!.exec("CREATE TRIGGER fail_log BEFORE INSERT ON review_log BEGIN SELECT RAISE(ABORT, 'log storage failure'); END");
  act(() => ui.result.current.reveal());
  await act(() => ui.result.current.handleGradeReview(3));
  expect(ui.result.current.reviewError).toBeTruthy();
  expect(storedGrade()).toEqual(before);
  expect(ui.result.current.session.currentCard?.nodeId).toBe('card');
  database!.exec('DROP TRIGGER fail_log');
  act(() => ui.result.current.reveal());
  await act(() => ui.result.current.handleGradeReview(3));
  expect(ui.result.current.reviewError).toBeNull();
  expect(storedGrade().logs).toHaveLength(1);
  expect(ui.result.current.state.workspace_snapshot).toEqual((await loadCompanionWorkspaceSyncState()).workspace_snapshot);
  expect(ui.result.current.session.currentCard).toBeNull();
  ui.unmount();
});
