// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ id: 'com.campfirium.foliole.android.acceptance' }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ id: app.id }) } }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

import { commitDailyFlow } from '../../../lib/core/flow/dailyFlowService';
import { createInitialSchedulerCard } from '../../../lib/core/review/types';

import { companionDailyFlowPersistence, companionDailyFlowSettings, loadCompanionDailySession, openCompanionDailyFlow } from './companion/runtime/companionDailyFlow';
import { closeIosCompanionDatabase, getIosCompanionDatabaseOwner, initializeIosCompanionDatabase } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from './companionSyncNodeVersionsTestSupport';
import { resetCompanionTestItemReviews, supportsCompanionTestReviewReset } from './companionTestReviewReset';

let root = '';
let sqlite: Database.Database;
async function open() {
  const file = path.join(root, 'phone.db');
  const existed = existsSync(file);
  sqlite = new Database(file);
  await initializeIosCompanionDatabase({ booted_at: '2026-10-30T00:00:00Z', database_path: null,
    database_ready: false, host_name: 'Test phone', runtime_kind: 'android-capacitor' },
  createFakeCapacitorDatabaseManager(sqlite, existed, () => {}));
}
beforeEach(async () => {
  app.id = 'com.campfirium.foliole.android.acceptance';
  root = mkdtempSync(path.join(os.tmpdir(), 'phone-review-reset-'));
  await open();
  const node = sqlite.prepare("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES (?,?,'Question','Body','now','now')");
  for (const id of ['topic', 'deleted', ...Array.from({ length: 10 }, (_, i) => `item-${i}`)]) {
    node.run(id, id === 'topic' ? 'topic' : 'item');
    sqlite.prepare("INSERT INTO node_review(node_id,due,state,reps) VALUES (?,'2099-01-01T00:00:00Z',2,1)").run(id);
    sqlite.prepare(`INSERT INTO review_log (id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at)
      VALUES (?,?,'phone',?,3,'','2026-10-01T00:00:00Z')`).run(id, id, id);
  }
  sqlite.exec("UPDATE nodes SET deleted_at='now' WHERE id='deleted'");
  sqlite.exec("INSERT INTO node_reading (node_id,last_handled_at,next_at,repetition_count) VALUES ('topic','2026-10-01T00:00:00Z','2099-01-01T00:00:00Z',4)");
});
afterEach(async () => {
  await closeIosCompanionDatabase();
  if (sqlite?.open) sqlite.close();
  rmSync(root, { recursive: true, force: true });
});
const rows = (table: string) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();

it('returns ten completed items to the real Flow, preserves content and reading, and survives reopening', async () => {
  const nodes = rows('nodes'); const reading = rows('node_reading');
  expect((await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'review-first' })).session.currentNodeId).toBeNull();
  expect(await resetCompanionTestItemReviews()).toHaveLength(10);
  expect(rows('nodes')).toEqual(nodes); expect(rows('node_reading')).toEqual(reading);
  expect(rows('node_review').map(row => (row as { node_id: string }).node_id).sort()).toEqual(['deleted', 'topic']);
  expect(sqlite.prepare("SELECT count(*) AS n FROM review_log WHERE kind='review'").get()).toEqual({ n: 12 });
  expect(sqlite.prepare("SELECT count(*) AS n FROM review_log WHERE kind='reset'").get()).toEqual({ n: 10 });
  await closeIosCompanionDatabase(); await open();
  const reopened = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'review-first' });
  expect(reopened.session.currentNodeId).toMatch(/^item-/);
  expect(sqlite.prepare('SELECT count(*) AS n FROM daily_flow_entries WHERE active=1').get()).toEqual({ n: 10 });
  expect(await resetCompanionTestItemReviews()).toHaveLength(10);
  expect((await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'review-first' })).session.currentNodeId).toMatch(/^item-/);
});

it('rejects the daily app even when the reset function is called directly', async () => {
  const before = rows('review_log');
  app.id = 'com.campfirium.foliole.android';
  expect(await supportsCompanionTestReviewReset()).toBe(false);
  await expect(resetCompanionTestItemReviews()).rejects.toThrow('test app');
  expect(rows('review_log')).toEqual(before);
});

async function finishTenItems() {
  sqlite.exec("DELETE FROM node_review WHERE node_id LIKE 'item-%'");
  const now = new Date().toISOString();
  let flow = await openCompanionDailyFlow({ now, mode: 'review-first' });
  const seen = new Set<string>();
  for (let index = 0; index < 10; index += 1) {
    const id = flow.session.currentNodeId!;
    expect(id).toMatch(/^item-/); expect(seen.has(id)).toBe(false); seen.add(id);
    const card = createInitialSchedulerCard(now);
    const session = flow.session;
    flow = await getIosCompanionDatabaseOwner().runWriter(db => commitDailyFlow(db, {
      opId: `finish-${index}`, now, token: session.daily!, sourceSession: session,
      grade: { nodeId: id, before: null, grade: 4, reviewedAt: now,
        schedulerVersion: '', cardBefore: card, cardAfter: card }
    }, companionDailyFlowSettings(), companionDailyFlowPersistence));
  }
  expect(flow.session.currentNodeId).toBeNull();
}

it('makes items available again after completing all ten through production Flow grading', async () => {
  await finishTenItems();
  await resetCompanionTestItemReviews();
  await closeIosCompanionDatabase(); await open();
  expect((await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'review-first' })).session.currentNodeId).toMatch(/^item-/);
});

it.each(['recommended', 'review-first', 'reading-only'] as const)('reopens reset items after a completed %s list changes membership', async mode => {
  await finishTenItems();
  await openCompanionDailyFlow({ now: new Date().toISOString(), mode });
  sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('new-item','item','New question','Body',?,?)`).run(new Date().toISOString(), new Date().toISOString());
  getIosCompanionDatabaseOwner().clearNodePriorities();
  const reading = rows('node_reading'); const nodes = rows('nodes');
  await resetCompanionTestItemReviews();
  const resumed = await loadCompanionDailySession();
  expect(sqlite.prepare('SELECT mode FROM daily_flow_state').get()).toEqual({ mode: 'review-first' });
  expect(resumed?.currentNodeId).not.toBeNull();
  expect(sqlite.prepare("SELECT count(*) AS n FROM daily_flow_entries WHERE active=1 AND handled=0 AND node_id LIKE 'item-%'").get())
    .toEqual({ n: 10 });
  expect(resumed?.cycle?.reviewRemaining).toBe(11);
  expect(resumed?.cycle?.clearedAt).toBeNull();
  expect(rows('node_reading')).toEqual(reading); expect(rows('nodes')).toEqual(nodes);
  await closeIosCompanionDatabase(); await open();
  const reopened = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'review-first' });
  expect(reopened.session.currentNodeId).not.toBeNull();
});

it('rolls back all items if one reset fails', async () => {
  const before = rows('review_log'); const reviews = rows('node_review');
  sqlite.exec(`CREATE TRIGGER reject_reset BEFORE INSERT ON review_log WHEN NEW.kind='reset' AND NEW.node_id='item-5'
    BEGIN SELECT RAISE(ABORT,'reset rejected'); END`);
  await expect(resetCompanionTestItemReviews()).rejects.toThrow('reset rejected');
  expect(rows('review_log')).toEqual(before); expect(rows('node_review')).toEqual(reviews);
});
