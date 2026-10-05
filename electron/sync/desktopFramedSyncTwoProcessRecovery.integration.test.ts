// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';

type Closeable = Readonly<{ close(): Promise<void> }>;
let root = '';
const closeables: Closeable[] = [];
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  await Promise.allSettled(closeables.splice(0).map((value) => value.close()));
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    const diagnostics = active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n');
    await fs.writeFile(`${root}/recovery-processes.log`, diagnostics);
    console.info('Failed framed-sync recovery fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

it('invalidates provisional fact and blob state after trailer authentication fails, then retries', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Body recovered after an invalid attempt',
    nodeId: 't326-attempt-recovery',
    title: 'Attempt recovery'
  });
  installAttemptAudit(fixture.rightSnapshot.databasePath);
  const proxy = await createDesktopFramedSyncFaultProxy({
    fault: 'corrupt_trailer',
    targetOrigin: fixture.rightSnapshot.origin
  });
  closeables.push(proxy);

  await expect(fixture.left.synchronize(
    proxy.origin,
    't326-attempt-recovery'
  )).rejects.toThrow();

  expect(readRecoveryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    attemptAudit: ['blob', 'fact'],
    availableBlobs: 0,
    blobChunks: 0,
    blobPins: 0,
    inboundAttempts: ['invalidated'],
    inboundFacts: 0,
    inboundFrames: 0,
    inboundStates: ['proposed'],
    receipts: 0
  });

  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-attempt-recovery');
  const recovered = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(recovered.nodes).toEqual([expect.objectContaining({ id: 't326-attempt-recovery' })]);
  expect(recovered.versions).toEqual([expect.objectContaining({
    body_text: 'Body recovered after an invalid attempt', object_id: 't326-attempt-recovery'
  })]);
  expect(readRecoveryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    availableBlobs: 1,
    inboundAttempts: ['invalidated', 'promoted'],
    inboundFacts: 1,
    inboundFrames: 4,
    inboundStates: ['applied'],
    receipts: 1
  });
});

it('replays the original durable receipt after its HTTP response is lost and the receiver restarts', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Body applied before receipt loss',
    nodeId: 't326-receipt-replay',
    title: 'Receipt replay'
  });
  const proxy = await createDesktopFramedSyncFaultProxy({
    fault: 'drop_receipt_response',
    targetOrigin: fixture.rightSnapshot.origin
  });
  closeables.push(proxy);

  await expect(fixture.left.synchronize(
    proxy.origin,
    't326-receipt-replay'
  )).rejects.toThrow();

  const firstReceipt = readRecoveryEvidence(fixture.rightSnapshot.databasePath);
  expect(firstReceipt).toMatchObject({
    inboundFrames: 4,
    inboundStates: ['applied'],
    receiptAttempts: 1,
    receiptFrames: 1,
    receipts: 1
  });
  expect(firstReceipt.receiptCiphertexts).toHaveLength(1);
  expect(readRecoveryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    outboundHolds: 1,
    outboundStates: ['published'],
    receipts: 0
  });

  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await fixture.left.synchronize(restarted.snapshot.origin, 't326-receipt-replay');

  const replayed = readRecoveryEvidence(restarted.snapshot.databasePath);
  expect(replayed).toMatchObject({
    inboundFrames: 4,
    inboundStates: ['applied'],
    receiptAttempts: 1,
    receiptFrames: 1,
    receipts: 1
  });
  expect(replayed.receiptCiphertexts).toEqual(firstReceipt.receiptCiphertexts);
  const received = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(received.nodes).toHaveLength(1);
  expect(received.versions).toHaveLength(1);
  expect(readRecoveryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    outboundHolds: 0,
    outboundStates: ['receipt_committed'],
    receipts: 1
  });
});

function installAttemptAudit(databasePath: string) {
  const sqlite = new Database(databasePath, { fileMustExist: true });
  try {
    sqlite.exec(`CREATE TABLE t326_attempt_audit (kind TEXT NOT NULL);
      CREATE TRIGGER t326_audit_fact AFTER INSERT ON framed_sync_inbound_facts
      BEGIN INSERT INTO t326_attempt_audit VALUES ('fact'); END;
      CREATE TRIGGER t326_audit_blob AFTER INSERT ON framed_sync_blob_chunks
      BEGIN INSERT INTO t326_attempt_audit VALUES ('blob'); END;`);
  } finally {
    sqlite.close();
  }
}

function readRecoveryEvidence(databasePath: string) {
  const sqlite = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const count = (table: string, where = '') => readCount(sqlite,
      `SELECT COUNT(*) AS count FROM ${table} ${where}`);
    return {
      attemptAudit: tableExists(sqlite, 't326_attempt_audit')
        ? readTextColumn(sqlite, 'SELECT kind AS value FROM t326_attempt_audit ORDER BY kind')
        : [],
      availableBlobs: count('framed_sync_available_blobs'),
      blobChunks: count('framed_sync_blob_chunks'),
      blobPins: count('framed_sync_blob_pins'),
      inboundAttempts: readTextColumn(sqlite,
        'SELECT state AS value FROM framed_sync_inbound_attempts ORDER BY rowid'),
      inboundFacts: count('framed_sync_inbound_facts'),
      inboundFrames: count('framed_sync_inbound_frames'),
      inboundStates: readTextColumn(sqlite,
        'SELECT state AS value FROM framed_sync_inbound_transfers ORDER BY rowid'),
      outboundHolds: count('framed_sync_outbound_holds'),
      outboundStates: readTextColumn(sqlite,
        'SELECT state AS value FROM framed_sync_outbound_publications ORDER BY rowid'),
      receiptAttempts: count('framed_sync_outbound_attempts', "WHERE purpose = 'receipt'"),
      receiptCiphertexts: readTextColumn(sqlite, `SELECT hex(ciphertext) AS value
        FROM framed_sync_outbound_frames WHERE purpose = 'receipt' ORDER BY rowid`),
      receiptFrames: count('framed_sync_outbound_frames', "WHERE purpose = 'receipt'"),
      receipts: count('framed_sync_receipts')
    };
  } finally {
    sqlite.close();
  }
}

function readCount(sqlite: Database.Database, sql: string) {
  const value: unknown = sqlite.prepare(sql).get();
  if (!isRecord(value) || typeof value.count !== 'number') throw new Error('recovery_count_invalid');
  return value.count;
}

function tableExists(sqlite: Database.Database, table: string) {
  const value: unknown = sqlite.prepare(
    'SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ?'
  ).get('table', table);
  return isRecord(value) && value.present === 1;
}

function readTextColumn(sqlite: Database.Database, sql: string) {
  const values: unknown[] = sqlite.prepare(sql).all();
  return values.map((value) => {
    if (!isRecord(value) || typeof value.value !== 'string') throw new Error('recovery_row_invalid');
    return value.value;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
