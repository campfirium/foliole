
// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub };
});

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../../../lib/core/database/desktopResourceSchemaStatements';
import { loadWorkspaceListSnapshot } from '../../../lib/core/database/workspaceListSnapshot';
import { createLocalReviewSchedulerAdapter } from '../../../lib/core/review/localSchedulerAdapter';
import { recomputeReview, type ReviewEvent } from '../../../lib/core/review/recomputeReview';
import { normalizeScheduledCardDue } from '../../../lib/core/review/reviewDayBoundary';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../../lib/core/review/settings';
import { createInitialSchedulerCard } from '../../../lib/core/review/types';
import { gradeCompanionReviewCard } from '../../companion/companionReviewSession';
import { persistCompanionReviewSyncObject } from '../../companion/companionReviewSyncPersistence';
import { createReviewSchedulerAdapter } from '../../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard } from '../../features/review/model/reviewTypes';
import { mobileReviewModel, receiveMobileReviewModel } from '../../test/companionReviewTraining.testSupport';

import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase
} from './companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from './companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReviewRecord } from './companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from './companionWorkspaceSync';

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

it('restores an earlier review snapshot through the local writer without adding a grade', async () => {
  const before = desktopSnapshot().nodesById.card!.review!;
  const result = await gradeCompanionReviewCard({ grade: 3, nodeId: 'card',
    now: '2026-05-04T12:00:00.000Z', snapshot: desktopSnapshot() });
  await persistCompanionReviewSyncObject({ itemKind: 'fsrs', nodeId: 'card',
    snapshot: result!.snapshot, reviewLog: result!.reviewLog });
  await saveCompanionSyncNodeReviewRecord({ nodeId: 'card', review: before });
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.card?.review).toEqual(before);
  expect(database!.prepare('SELECT * FROM review_log').all()).toHaveLength(1);
});

it.each([1, 2, 3, 4] as const)('rebuilds mobile grading from its recorded history for grade %s', async (grade) => {
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
  const rebuilt = toNodeReviewProfile((await createLocalReviewSchedulerAdapter().grade({
    card: createInitialSchedulerCard(now), grade, now })).card);
  expect(desktopSnapshot().nodesById.card?.review).toEqual(rebuilt);
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById.card?.review).toEqual(rebuilt);
});

function seedMobileHistory() {
  const events: ReviewEvent[] = [1, 2, 3].map((day, index) => ({ op_id: `history-${day}`,
    reviewed_at: `2026-05-0${day}T12:00:00.000Z`, grade: index === 0 ? 3 : 1,
    kind: 'review', voids_op_id: null }));
  const insert = database!.prepare(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
    VALUES (?, ?, 'fixture', 'card', ?, '', ?, ?, ?)`);
  for (const event of events) insert.run(event.op_id, event.op_id, event.grade, event.reviewed_at, event.kind, event.voids_op_id);
  return events;
}

it.each([1, 2, 3, 4] as const)('uses received folder parameters immediately and after saving grade %s and reopening', async grade => {
  const events = seedMobileHistory();
  const before = database!.prepare('SELECT * FROM node_review').all();
  const model = mobileReviewModel('inbox');
  await receiveMobileReviewModel(model);
  expect(database!.prepare('SELECT * FROM node_review').all()).toEqual(before);
  await closeIosCompanionDatabase(); await openLibrary();
  const now = '2026-05-04T12:00:00.000Z';
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const actual = await gradeCompanionReviewCard({ grade, nodeId: 'card', now, snapshot });
  const next = [...events, { op_id: '~preview', kind: 'review' as const, grade, reviewed_at: now, voids_op_id: null }];
  const expected = recomputeReview(next, { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, weights: model.weights })!;
  const normalized = normalizeScheduledCardDue({ card: expected, reviewedAt: now,
    newDayStartsAtHour: DEFAULT_REVIEW_SCHEDULER_SETTINGS.newDayStartsAtHour });
  expect(actual!.reviewLog.cardAfter).toEqual(normalized);
  expect(expected).not.toEqual(recomputeReview(next, DEFAULT_REVIEW_SCHEDULER_SETTINGS));
  expect(database!.prepare('SELECT * FROM node_review').all()).toEqual(before);
  await persistCompanionReviewSyncObject({ itemKind: 'fsrs', nodeId: 'card', snapshot: actual!.snapshot, reviewLog: actual!.reviewLog });
  await closeIosCompanionDatabase(); await openLibrary();
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot!.nodesById.card!.review).toEqual(toNodeReviewProfile(expected));
});

it('resolves inheritance and current folder ownership on every request without retraining', async () => {
  const events = seedMobileHistory();
  const adapter = createReviewSchedulerAdapter();
  const now = '2026-05-04T12:00:00.000Z';
  const input = { nodeId: 'card', card: createInitialSchedulerCard(now), now, grade: 3 as const };
  const next = [...events, { op_id: '~preview', kind: 'review' as const, grade: 3, reviewed_at: now, voids_op_id: null }];
  const expected = (weights?: number[]) => recomputeReview(next, { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, weights });
  expect((await adapter.grade(input)).card).toEqual(expected());
  const global = mobileReviewModel(null);
  await receiveMobileReviewModel(global);
  await closeIosCompanionDatabase(); await openLibrary();
  expect((await adapter.grade(input)).card).toEqual(expected());
  database!.exec("INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at) VALUES ('child', 'inbox', 'folder', 'Child', 'now', 'now'); UPDATE nodes SET parent_id='child' WHERE id='card'");
  const parent = mobileReviewModel('inbox'); parent.weights[2] = 24;
  await receiveMobileReviewModel(parent);
  await receiveMobileReviewModel({ ...mobileReviewModel('child'), enabled: false });
  expect((await adapter.grade(input)).card).toEqual(expected(parent.weights));
  database!.exec("UPDATE nodes SET parent_id=NULL WHERE id='card'");
  expect((await adapter.grade(input)).card).toEqual(expected());
});

it('fails closed when the companion database is unavailable', async () => {
  const adapter = createReviewSchedulerAdapter();
  await closeIosCompanionDatabase();
  const now = '2026-05-04T12:00:00.000Z';
  await expect(adapter.grade({ nodeId: 'card', card: createInitialSchedulerCard(now), now, grade: 3 })).rejects.toThrow('not ready');
});

it('replays reset and void facts with the current inherited retention and weights', async () => {
  const events = seedMobileHistory();
  database!.exec(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
    VALUES ('reset', 'reset', 'fixture', 'card', 0, '', '2026-05-02T13:00:00Z', 'reset', NULL),
      ('void', 'void', 'fixture', 'card', 0, '', '2026-05-03T13:00:00Z', 'void', 'history-3');
    UPDATE nodes SET desired_retention=0.97 WHERE id='inbox'`);
  const model = mobileReviewModel('inbox'); await receiveMobileReviewModel(model);
  const actualEvents = [...events,
    { op_id: 'reset', grade: 0, kind: 'reset' as const, reviewed_at: '2026-05-02T13:00:00Z', voids_op_id: null },
    { op_id: 'void', grade: 0, kind: 'void' as const, reviewed_at: '2026-05-03T13:00:00Z', voids_op_id: 'history-3' }];
  const now = '2026-05-04T12:00:00.000Z';
  const adapter = createReviewSchedulerAdapter();
  const input = { nodeId: 'card', card: createInitialSchedulerCard(now), now };
  const next = { op_id: '~preview', kind: 'review' as const, grade: 3, reviewed_at: now, voids_op_id: null };
  const expected = recomputeReview([...actualEvents, next], { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    weights: model.weights, desiredRetention: 0.97 });
  expect((await adapter.grade({ ...input, grade: 3 })).card).toEqual(expected);
  expect((await adapter.preview(input)).Good.card).toEqual(expected);
  expect(expected?.reps).toBe(1);
});
