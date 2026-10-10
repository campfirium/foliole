// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions, saveCompanionSyncNodeReadingRecord, saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { selectCanonicalReviewQueueSource } from '../shared/workspaceCanonicalSelectors';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';

import { useCompanionFlowSession } from './useCompanionFlowSession';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  })
}));

const past = '2020-01-01T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';
let root = '';
let database: Database.Database | null = null;

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'only-review-refresh-'));
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
    booted_at: past, database_path: null, database_ready: false,
    host_name: 'Only Review refresh fixture', runtime_kind: 'android-capacitor'
  }, manager);
});

afterEach(async () => {
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

async function seed(id: string, kind: 'topic' | 'item') {
  const node: WorkspaceNodeSnapshot = {
    id, kind, content: `Body ${id}`, reveal: kind === 'item' ? 'Answer' : null,
    title: id, parentNodeId: null, createdAt: past, updatedAt: past,
    hideTitleHeading: false, isTitleManual: true, anchorLink: null, reading: null, review: null
  };
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion(node, 'refresh-test')]);
}

async function setDue(id: string, due: string) {
  await saveCompanionSyncNodeReviewRecord({ nodeId: id, review: {
    difficulty: 4.2, due, elapsedDays: 2, lapses: 0,
    lastReviewAt: past, reps: 3, scheduledDays: 2, stability: 2.1, state: 2
  } });
}

function refreshDue(id: string, due: string) {
  database!.prepare('UPDATE node_review SET due = ? WHERE node_id = ?').run(due, id);
}

async function snapshot() {
  return (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
}

it('adds newly due FSRS items to an open Only Review session without replacing its current item', async () => {
  await seed('reading', 'topic');
  await seed('first', 'item');
  await seed('second', 'item');
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'reading', reading: {
    intervalDurationMs: 60000, intervalGrowthFactor: 1.5, lastHandledAt: past,
    nextAt: past, priority: 5, readingPosition: 0, repetitionCount: 1, state: 'active'
  } });
  await setDue('first', future);
  await setDue('second', future);
  const initial = await snapshot();
  const ui = renderHook(({ value }) => useCompanionFlowSession({
    snapshot: value, ready: true, active: true, onlyReview: true,
    libraryScope: value.libraryScope ?? 'refresh-test'
  }), { initialProps: { value: initial } });
  await waitFor(() => expect(ui.result.current.ready).toBe(true));
  expect(ui.result.current.view.queueNodeIds).toEqual([]);
  expect(ui.result.current.view.currentCard).toBeNull();

  refreshDue('first', past);
  const firstRefresh = await snapshot();
  expect(buildReviewQueuePlan({ ...selectCanonicalReviewQueueSource(firstRefresh),
    mode: 'review-first', now: new Date().toISOString() }).queueNodeIds).toEqual(['first']);
  act(() => ui.rerender({ value: firstRefresh }));
  expect(ui.result.current.view.queueNodeIds).toEqual(['first']);
  expect(ui.result.current.view.currentCard?.nodeId).toBe('first');
  act(() => ui.result.current.reveal());

  refreshDue('first', future);
  refreshDue('second', past);
  const secondRefresh = await snapshot();
  expect(buildReviewQueuePlan({ ...selectCanonicalReviewQueueSource(secondRefresh),
    mode: 'review-first', now: new Date().toISOString() }).queueNodeIds).toEqual(['second']);
  act(() => ui.rerender({ value: secondRefresh }));
  expect(ui.result.current.view.queueNodeIds).toEqual(['first', 'second']);
  expect(ui.result.current.view.currentCard?.nodeId).toBe('first');
  expect(ui.result.current.isAnswerRevealed).toBe(true);
  act(() => ui.rerender({ value: secondRefresh }));
  expect(ui.result.current.view.queueNodeIds).toEqual(['first', 'second']);
  ui.unmount();
});
