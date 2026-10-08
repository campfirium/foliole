// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA } from '../database/framedSyncResourceDemandSchema.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../database/framedSyncStagingSchema.js';

import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { completeFramedSyncResourceDemand, ensureFramedSyncMissingResourceDemand,
  obsoleteFramedSyncResourceDemand, startFramedSyncResourceDemandRequest } from './framedSyncResourceDemands.js';
import { projectFramedSyncResourceFact } from './framedSyncResourceFact.js';

const key = { groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b',
  globalId: 'article', versionId: 'version', bodyHash: 'a'.repeat(64), storageKey: `${'b'.repeat(64)}.png` };
const context = { ...key, protocolVersion: 22 as const, senderDeviceId: 'A', senderLibraryEpoch: 'a' };
const factFor = (demandId: string) => projectFramedSyncResourceFact({ ...key, demandId,
  sharedStateHash: new Uint8Array(32).fill(3) },
{ storageKey: key.storageKey, contentHash: 'b'.repeat(64), role: 2 }, 123n);

it('retains pending demand through SQLite reopen and creates a new identity only after completion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-demand-'));
  const file = path.join(root, 'library.db');
  let sqlite = new Database(file);
  try {
    sqlite.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
    for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
    let db = createBetterSqliteDbPort(sqlite);
    let created = 0;
    const createId = () => `demand-${++created}`;
    expect(await ensureFramedSyncMissingResourceDemand(db, key, createId)).toBe('demand-1');
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    expect(await ensureFramedSyncMissingResourceDemand(db, key, createId)).toBe('demand-1');
    expect(created).toBe(1);
    const fact = factFor('demand-1');
    const contentId = await canonicalContentId({ facts: [fact], blobs: fact.blobs });
    const transferId = await canonicalTransferId(context, contentId);
    await expect(completeFramedSyncResourceDemand(db, context, fact, transferId))
      .rejects.toThrow('framed_sync_resource_demand_receipt_missing');
    const commit = (fail: boolean) => db.transaction(async (tx) => {
      await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)',
        [transferId, contentId, key.receiverDeviceId, key.receiverLibraryEpoch, contentId]);
      await completeFramedSyncResourceDemand(tx, context, fact, transferId);
      if (fail) throw new Error('receipt_commit_failed');
    });
    await expect(commit(true)).rejects.toThrow('receipt_commit_failed');
    expect(sqlite.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    await commit(false);
    await completeFramedSyncResourceDemand(db, context, fact, transferId);
    await expect(completeFramedSyncResourceDemand(db,
      { ...context, receiverLibraryEpoch: 'another-library' }, fact, transferId))
      .rejects.toThrow('framed_sync_resource_demand_mismatch');
    expect(await ensureFramedSyncMissingResourceDemand(db, key, createId)).toBe('demand-2');
    const second = factFor('demand-2');
    expect(await canonicalContentId({ facts: [second], blobs: second.blobs })).not.toEqual(contentId);
    await expect(completeFramedSyncResourceDemand(db, context, fact, transferId))
      .rejects.toThrow('framed_sync_resource_demand_mismatch');
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    await obsoleteFramedSyncResourceDemand(db, 'demand-2');
    expect(sqlite.prepare('SELECT state, transfer_id FROM framed_sync_resource_demands').get())
      .toEqual({ state: 'no_longer_required', transfer_id: null });
    await expect(completeFramedSyncResourceDemand(db, context, second, transferId))
      .rejects.toThrow('framed_sync_resource_demand_mismatch');
    expect(await ensureFramedSyncMissingResourceDemand(db, key, createId)).toBe('demand-3');
  } finally {
    if (sqlite.open) sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps a started request pending across timeout and reopen while unsent obsolete work can end', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-started-demand-'));
  const file = path.join(root, 'library.db');
  let sqlite = new Database(file);
  try {
    for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
    let db = createBetterSqliteDbPort(sqlite);
    await ensureFramedSyncMissingResourceDemand(db, key, () => 'started');
    await expect(startFramedSyncResourceDemandRequest(db,
      { ...key, receiverLibraryEpoch: 'wrong' }, 'started', new Uint8Array(32).fill(3))).rejects.toThrow('not_pending');
    await startFramedSyncResourceDemandRequest(db, key, 'started', new Uint8Array(32).fill(3));
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    await obsoleteFramedSyncResourceDemand(db, 'started');
    expect(sqlite.prepare('SELECT state, request_started FROM framed_sync_resource_demands').get())
      .toEqual({ state: 'pending', request_started: 1 });
    expect(await ensureFramedSyncMissingResourceDemand(db, key, () => 'replacement')).toBe('started');
    await startFramedSyncResourceDemandRequest(db, key, 'started', new Uint8Array(32).fill(3));
    await expect(startFramedSyncResourceDemandRequest(db, key, 'started', new Uint8Array(32).fill(4)))
      .rejects.toThrow('not_pending');
    await expect(startFramedSyncResourceDemandRequest(db, key, 'started', new Uint8Array(31)))
      .rejects.toThrow('request_hash_invalid');
    const fact = factFor('started');
    const contentId = await canonicalContentId({ facts: [fact], blobs: fact.blobs });
    const transferId = await canonicalTransferId(context, contentId);
    await expect(completeFramedSyncResourceDemand(db, context,
      { ...fact, sharedStateHash: new Uint8Array(32).fill(4) }, transferId)).rejects.toThrow('hash_mismatch');
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)',
        [transferId, contentId, key.receiverDeviceId, key.receiverLibraryEpoch, contentId]);
      await completeFramedSyncResourceDemand(tx, context, fact, transferId);
    });
    await ensureFramedSyncMissingResourceDemand(db, key, () => 'new-loss');
    expect(sqlite.prepare('SELECT request_started, shared_state_hash FROM framed_sync_resource_demands').get())
      .toEqual({ request_started: 0, shared_state_hash: null });
    await obsoleteFramedSyncResourceDemand(db, 'new-loss');
    await expect(startFramedSyncResourceDemandRequest(db, key, 'new-loss', new Uint8Array(32).fill(3))).rejects.toThrow('not_pending');
  } finally {
    if (sqlite.open) sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
