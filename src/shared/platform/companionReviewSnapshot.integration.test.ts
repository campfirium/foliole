// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => undefined,
    closeFramedSyncPayloadBudget: async () => undefined
  })
}));

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../../../lib/core/database/desktopResourceSchemaStatements';
import { loadWorkspaceListSnapshot } from '../../../lib/core/database/workspaceListSnapshot';
import { gradeCompanionReviewCard } from '../../companion/companionReviewSession';
import { persistCompanionReviewSyncObject } from '../../companion/companionReviewSyncPersistence';
import { toSchedulerCard } from '../../features/review/model/reviewTypes';

import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from './companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReviewRecord } from './companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from './companionWorkspaceSync';

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
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-review-snapshot-'));
  await openLibrary();
  const insert = database!.prepare(
    'INSERT INTO nodes (id, parent_id, title, kind, sequential_reading_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const now = '2026-05-01T00:00:00.000Z';
  insert.run('inbox', null, 'Inbox', 'folder', 0, now, now);
  insert.run('card', 'inbox', 'Card', 'item', 0, now, now);
  await saveCompanionSyncNodeReviewRecord({ nodeId: 'card', review: {
    difficulty: 4.2, due: now, elapsedDays: 2, lapses: 1,
    lastReviewAt: now, reps: 3, scheduledDays: 2, stability: 2.1, state: 2
  } });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

function desktopSnapshot() {
  database!.exec(DESKTOP_RESOURCE_SCHEMA_STATEMENTS.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS settings'))!);
  database!.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('host_name', ?, '2026-05-01')")
    .run('"Android mutation fixture"');
  return loadWorkspaceListSnapshot(createBetterSqlite3Driver(database!), { includePdfOpenings: false })!;
}

it('preserves every persisted FSRS field through mobile load and reopen', async () => {
  const expected = { difficulty: 4.2, due: '2026-05-01T00:00:00.000Z', elapsedDays: 2,
    lapses: 1, lastReviewAt: '2026-05-01T00:00:00.000Z', reps: 3,
    scheduledDays: 2, stability: 2.1, state: 2 };
  expect(desktopSnapshot().nodesById.card?.review).toEqual(expected);
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.card?.review).toEqual(expected);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.card?.review).toEqual(expected);
});

it.each([1, 2, 3, 4] as const)('grades persisted mobile history like desktop for grade %s', async (grade) => {
  const now = '2026-05-04T12:00:00.000Z';
  const desktop = desktopSnapshot();
  const mobile = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const expected = await gradeCompanionReviewCard({ grade, nodeId: 'card', now, snapshot: desktop });
  const actual = await gradeCompanionReviewCard({ grade, nodeId: 'card', now, snapshot: mobile });
  expect(expected).not.toBeNull();
  expect.soft(actual?.reviewLog.cardBefore).toEqual(toSchedulerCard(desktop.nodesById.card!.review, now));
  expect.soft(actual?.reviewLog).toEqual(expected?.reviewLog);
  expect.soft(actual?.snapshot.nodesById.card?.review).toEqual(expected?.snapshot.nodesById.card?.review);
  await persistCompanionReviewSyncObject({
    itemKind: 'fsrs', nodeId: 'card', snapshot: actual!.snapshot, reviewLog: actual!.reviewLog
  });
  expect(database!.prepare('SELECT * FROM review_log').all()).toHaveLength(1);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(desktopSnapshot().nodesById.card?.review).toEqual(expected?.snapshot.nodesById.card?.review);
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.card?.review)
    .toEqual(expected?.snapshot.nodesById.card?.review);
});
