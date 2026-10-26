// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

import { createBetterSqlite3Driver } from '../../../../../electron/database/betterSqlite3Driver';
import { restoreFixture } from '../../../../../electron/database/requestSyncRestoreRecovery.testSupport';
import { seedTrainingPeer } from '../../../../../electron/database/reviewTraining.testSupport';
import { readNodeReviewParameters, recomputeNodeReview } from '../../../../../lib/core/database/reviewProjection';
import { readReviewTrainingInput, readReviewTrainingPlan } from '../../../../../lib/core/database/reviewTrainingInput';
import { readReviewModels } from '../../../../../lib/core/database/reviewTrainingModels';
import { readStoredReviewCard } from '../../../../../lib/core/database/storedReviewCard';
import { recomputeReview } from '../../../../../lib/core/review/recomputeReview';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../../../../lib/core/review/settings';
import { trainingEvents } from '../../../../../lib/core/review/trainingFixture.testSupport';
import { reviewModelKey } from '../../../../../lib/core/review/trainingModel';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import { compareFramedSyncInventories } from '../../../../../lib/core/sync/framedSyncInventory';
import { readRequestSyncInventorySnapshot } from '../../../../../lib/core/sync/framedSyncInventoryRead';
import { withRequestSyncFiles } from '../../../../../lib/core/sync/requestSyncFiles';
import { applyRequestSyncObject } from '../../../../../lib/core/sync/requestSyncObjectApply';
import { writeRequestSyncSnapshot } from '../../../../../lib/core/sync/requestSyncSnapshot';
import { identityReviewRowSchema } from '../../../../../lib/core/sync/syncFactRowSchemas';
import { createReviewSchedulerAdapter } from '../../../../features/review/model/reviewSchedulerFactory';
import { startReviewTrainingIdle } from '../../../../features/review/model/reviewTrainingIdle';
import { getReviewTrainingSession, subscribeReviewTrainingSession } from '../../../../features/review/model/reviewTrainingSession';
import { toSchedulerCard } from '../../../../features/review/model/reviewTypes';
import { createFakeCapacitorDatabaseManager } from '../../companionSyncNodeVersionsTestSupport';
import { loadReviewTrainingInput, loadReviewTrainingPlan, saveReviewTrainingModel } from '../../desktop/reviewTrainingRuntimeRepository';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { saveIosReview } from './iosCompanionActiveDatabaseWrites';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from './iosCompanionDatabaseBootstrap';

let root = '';
let sqlite: Database.Database | null = null;
let train: typeof import('../../../../features/review/model/trainFolderReviewModel').trainFolderReviewModel;
beforeAll(async () => {
  vi.stubGlobal('self', new EventTarget());
  const wasm = await import('fsrs-browser/fsrs_browser.js');
  wasm.initSync({ module: readFileSync('node_modules/fsrs-browser/fsrs_browser_bg.wasm') });
  train = (await import('../../../../features/review/model/trainFolderReviewModel')).trainFolderReviewModel;
  await import('../../../../features/review/model/reviewTraining.worker');
});
afterEach(async () => {
  vi.useRealTimers();
  await closeIosCompanionDatabase();
  if (sqlite?.open) sqlite.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function open(platform: 'android' | 'ios') {
  const file = path.join(root, 'mobile.db');
  const existed = existsSync(file);
  sqlite = new Database(file);
  await initializeIosCompanionDatabase({ booted_at: '2026-10-26T00:00:00Z', database_path: null,
    database_ready: false, host_name: 'Mobile training fixture', runtime_kind: `${platform}-capacitor` },
  createFakeCapacitorDatabaseManager(sqlite, existed, () => { sqlite = null; }));
}
function seed() {
  const db = sqlite!;
  db.transaction(() => {
    db.prepare("INSERT INTO nodes(id,kind,title,created_at,updated_at) VALUES ('folder','folder','Folder','now','now')").run();
    for (const id of new Set(trainingEvents().map(row => row.nodeId))) {
      db.prepare("INSERT INTO nodes(id,parent_id,kind,title,created_at,updated_at) VALUES (?,'folder','item','Card','now','now')").run(id);
    }
    const insert = db.prepare(`INSERT INTO review_log(id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at,kind)
      VALUES (?,?,'fixture',?,?,'',?,'review')`);
    for (const row of trainingEvents()) insert.run(row.opId, row.opId, row.nodeId, row.grade, row.reviewedAt);
  })();
  recomputeNodeReview(createBetterSqlite3Driver(db), 'topic');
}

it.each(['android', 'ios'] as const)('trains from %s owner facts, saves canonical models, and grades durably after reopening', async platform => {
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-training-')); await open(platform); seed();
  const driver = createBetterSqlite3Driver(sqlite!);
  const before = sqlite!.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  const plan = await loadReviewTrainingPlan();
  expect(plan.folders.map(row => row.folderId)).toEqual(['folder']);
  expect(plan.folders).toEqual(readReviewTrainingPlan(driver, plan.libraryScope).folders);
  const folderInput = await loadReviewTrainingInput('folder', plan.libraryScope);
  const model = train(folderInput); expect(model.enabled).toBe(true);
  expect(folderInput.baselineWeights).toBeNull();
  expect(folderInput).toEqual(readReviewTrainingInput(driver, 'folder', plan.libraryScope));
  await saveReviewTrainingModel(train(folderInput), plan.libraryScope);
  expect((await loadReviewTrainingPlan()).folders).toEqual([]);
  expect(sqlite!.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(before);
  expect(sqlite!.prepare("SELECT object_id, sync_dirty FROM sync_object_state WHERE object_type='setting' ORDER BY object_id").all())
    .toEqual([reviewModelKey('folder')].sort().map(key => ({ object_id: `user_space:windows:desktop:*:${key}`, sync_dirty: 1 })));
  await closeIosCompanionDatabase(); await open(platform);
  const events = sqlite!.prepare("SELECT * FROM review_log WHERE node_id='topic'").all().map(row => identityReviewRowSchema.parse(row));
  const now = '2026-10-26T12:00:00.000Z';
  const result = await createReviewSchedulerAdapter().grade({ nodeId: 'topic', card: toSchedulerCard({
    difficulty: 0, due: now, elapsedDays: 0, lapses: 0, lastReviewAt: null, reps: 0, scheduledDays: 0, stability: 0, state: 0
  }, now), grade: 3, now });
  const reviewLog = { op_id: 'mobile-grade', node_id: 'topic', grade: 3, scheduler_version: '', reviewed_at: now, kind: 'review', voids_op_id: null };
  await saveIosReview({ node_id: 'topic', review_json: '{}', review_log_json: JSON.stringify({ opId: 'mobile-grade', grade: 3, schedulerVersion: '', reviewedAt: now }) });
  const reopened = createBetterSqlite3Driver(sqlite!);
  const allEvents = [...events, identityReviewRowSchema.parse({ ...reviewLog, id: 'mobile-grade', host_name: 'fixture' })];
  const expected = recomputeReview(allEvents, readNodeReviewParameters(reopened, 'topic'))!;
  expect(readStoredReviewCard(reopened, 'topic')).toEqual(expected);
  expect(expected).not.toEqual(recomputeReview(allEvents, DEFAULT_REVIEW_SCHEDULER_SETTINGS));
  expect(result.card.stability).toBe(expected.stability);
  const staleScope = plan.libraryScope;
  await expect(saveReviewTrainingModel(model, staleScope)).rejects.toThrow('review_training_library_changed');
  await expect(loadReviewTrainingInput('folder', staleScope)).rejects.toThrow('review_training_library_changed');
});

it('exports a phone-trained model through production request/framed sync into an independent desktop database', async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-training-sync-')); await open('android'); seed();
  const fixture = await restoreFixture(); const desktop = fixture.peer('source');
  try {
    const driver = await seedTrainingPeer(desktop);
    await desktop.db.run(`INSERT INTO sync_group_devices
      (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,platform,state,joined_at,updated_at)
      VALUES ('group','mobile','mobile','/mobile','Mobile','android','active','now','now')`);
    await writeIosCompanionDatabase(async db => {
      await db.run("INSERT OR IGNORE INTO sync_groups VALUES ('group','Group','secret','now','now')");
      await db.run("INSERT OR IGNORE INTO sync_group_local_state VALUES (1,'group','mobile','active','now')");
      await db.run("UPDATE node_version_local_proof_state SET library_epoch='mobile-epoch'");
      for (const id of ['source', 'mobile']) await db.run(`INSERT OR IGNORE INTO sync_group_devices
        (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,platform,state,joined_at,updated_at)
        VALUES ('group',?,?,?,?,'android','active','now','now')`, [id, id, `/${id}`, id]);
    });
    const plan = await loadReviewTrainingPlan();
    await saveReviewTrainingModel(train(await loadReviewTrainingInput('folder', plan.libraryScope)), plan.libraryScope);
    const before = desktop.sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
    const difference = compareFramedSyncInventories({ local: await readIosCompanionDatabase(readRequestSyncInventorySnapshot), remote: [] })
      .find(row => row.objectType === 'setting' && row.globalId.endsWith(`:${reviewModelKey('folder')}`))!;
    await withRequestSyncFiles(desktop.host.files, async request => {
      await readIosCompanionDatabase(db => writeRequestSyncSnapshot(db, { ...difference, direction: 'local_to_remote' }, request));
      await desktop.db.transaction(tx => applyRequestSyncObject(tx, {
        context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, senderDeviceId: 'mobile',
          senderLibraryEpoch: 'mobile-epoch', receiverDeviceId: desktop.id, receiverLibraryEpoch: desktop.epoch },
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'mobile', library_epoch: 'mobile-epoch',
          proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        objectType: 'setting', globalId: difference.globalId, requestId: new Uint8Array(16), enqueueSearchInvalidations: false,
        facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob)
      }));
    });
    expect(readReviewModels(driver)).toEqual(readReviewModels(createBetterSqlite3Driver(sqlite!)));
    expect(desktop.sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(before);
    desktop.reopen();
    expect(readReviewModels(createBetterSqlite3Driver(desktop.sqlite))).toEqual(readReviewModels(createBetterSqlite3Driver(sqlite!)));
  } finally { await fixture.close(); }
});

it('honors the same effective-fact threshold and rejects invalid saves without changing models', async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-training-threshold-')); await open('android'); seed();
  sqlite!.prepare("DELETE FROM review_log WHERE CAST(substr(op_id,8) AS INTEGER) >= 1024").run();
  let plan = await loadReviewTrainingPlan(); expect(plan.folders).toHaveLength(1);
  sqlite!.exec(`INSERT INTO review_log(id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at,kind,voids_op_id)
    VALUES ('void','void','fixture','topic',0,'','2026-10-26T08:00:00Z','void','sample-0'),
    ('reset','reset','fixture','topic',0,'','2026-10-26T08:00:00Z','reset',NULL)`);
  expect((await loadReviewTrainingPlan()).folders).toEqual([]);
  await expect(loadReviewTrainingInput('folder', plan.libraryScope)).rejects.toThrow('review_training_threshold_not_reached');
  sqlite!.prepare("DELETE FROM review_log WHERE op_id='void'").run(); plan = await loadReviewTrainingPlan();
  const input = await loadReviewTrainingInput('folder', plan.libraryScope);
  expect(input.reviewCount).toBe(1024); expect(input.events.some(row => row.kind === 'reset')).toBe(true);
  const model = train(input);
  expect(() => train({ ...input, folderId: null })).toThrow('review_training_folder_invalid');
  await expect(loadReviewTrainingInput(null, plan.libraryScope)).rejects.toThrow('review_training_folder_invalid');
  await expect(async () => saveReviewTrainingModel({ ...model, weights: [] }, plan.libraryScope)).rejects.toThrow();
  await expect(async () => saveReviewTrainingModel({ ...model, folderId: null }, plan.libraryScope)).rejects.toThrow('review_training_folder_invalid');
  await expect(saveReviewTrainingModel({ ...model, folderId: 'missing' }, plan.libraryScope)).rejects.toThrow('review_training_folder_invalid');
  expect(readReviewModels(createBetterSqlite3Driver(sqlite!))).toEqual([]);
});


it('runs automatic idle through production worker code, the real engine, and the mobile SQLite owner without a button', async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-training-auto-')); await open('android'); seed();
  const before = sqlite!.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  let stopped = 0;
  // Only the browser transport is adapted for Node; the production worker handler and engine run unchanged.
  vi.stubGlobal('Worker', class {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    postMessage(data: unknown) {
      const transport = self as unknown as { onmessage: (event: { data: unknown }) => Promise<void>; postMessage: (result: unknown) => void };
      transport.postMessage = result => this.onmessage?.({ data: structuredClone(result) });
      void transport.onmessage({ data: structuredClone(data) });
    }
    terminate() { stopped += 1; }
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.useFakeTimers();
  const idle = startReviewTrainingIdle();
  let started = false;
  let unsubscribe = () => {};
  const done = new Promise<void>(resolve => {
    unsubscribe = subscribeReviewTrainingSession(() => {
      if (getReviewTrainingSession().running) started = true;
      else if (started) resolve();
    });
  });
  try {
    await vi.advanceTimersByTimeAsync(29999);
    expect(readReviewModels(createBetterSqlite3Driver(sqlite!))).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    const models = readReviewModels(createBetterSqlite3Driver(sqlite!));
    expect(models.map(model => model.folderId).sort()).toEqual(['folder']);
    expect(models.find(model => model.folderId === 'folder')?.enabled).toBe(true);
    expect(sqlite!.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(before);
    expect((await loadReviewTrainingPlan()).folders).toEqual([]);
    expect(stopped).toBe(1);
  } finally { unsubscribe(); idle.dispose(); vi.unstubAllGlobals(); }
});
