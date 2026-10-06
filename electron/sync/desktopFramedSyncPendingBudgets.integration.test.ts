// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';

import { resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';

const QUERY_BUDGET = 2 * 1024 * 1024;

function resultBytes(rows: readonly DbRow[]) {
  return rows.reduce((total, row) => total + Object.values(row).reduce<number>((size, value) =>
    size + (typeof value === 'string' ? Buffer.byteLength(value) :
      value instanceof Uint8Array ? value.byteLength : 0), 0), 0);
}

// Observe real SQLite result allocations without substituting any query or write.
function boundedResults(db: DbPort): DbPort {
  return {
    run: (sql, params) => db.run(sql, params),
    async query<T extends DbRow>(sql: string, params: DbParams = []) {
      const rows = await db.query<T>(sql, params);
      if (resultBytes(rows) > QUERY_BUDGET) throw new Error('reconnect_query_body_budget_exceeded');
      return rows;
    },
    transaction: (execute) => db.transaction((tx) => execute(boundedResults(tx)))
  };
}

async function seedSettings(db: DbPort) {
  for (let index = 0; index < 6; index += 1) {
    const payload = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: '*',
      key: `pending-budget-${index}`, platform: 'windows', scope: 'user_space',
      value_json: JSON.stringify('x'.repeat(600 * 1024)) });
    await db.transaction((tx) => applySyncObjectInTransaction(tx, {
      object_type: 'setting', object_id: `user_space:windows:desktop:*:pending-budget-${index}`,
      content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: '2026-10-07'
    }, { hostName: 'Provider', onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
  }
}

function publishedIdentities(db: Database.Database) {
  return db.prepare(`SELECT lower(hex(transfer_id)) AS transfer_id,
    lower(hex(content_id)) AS content_id, lower(hex(manifest_hash)) AS manifest_hash
    FROM framed_sync_outbound_publications ORDER BY rowid`).all();
}

it('resumes multiple large immutable deliveries within a bounded body read after an interrupted receipt', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const source = new Database(fixture.leftSnapshot.databasePath);
  const target = new Database(fixture.rightSnapshot.databasePath);
  const db = createBetterSqliteDbPort(source);
  const proxy = await createDesktopFramedSyncFaultProxy({ fault: 'drop_receipt_response',
    dropReceiptResponseAt: 2, targetOrigin: fixture.rightSnapshot.origin });
  try {
    await seedSettings(db);
    const input = { db, groupId: 't326-group', groupSecret: Buffer.alloc(32, 7).toString('base64url'),
      local: { deviceId: 'desktop-a', libraryEpoch: 'desktop-a-epoch' },
      peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: proxy.origin, staging: createDesktopFramedSyncStaging(db) };
    const endpoint = createDesktopFramedSyncRoundEndpoint(input);
    const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(db), remote: [] });
    for (const difference of differences) {
      const selected = await endpoint.selectOutbound(difference);
      if (selected.kind !== 'published') throw new Error('pending_budget_publication_deferred');
    }
    const before = publishedIdentities(source);
    expect(before.length).toBeGreaterThanOrEqual(6);
    const bounded = boundedResults(db);
    const resumed = { ...input, db: bounded, staging: createDesktopFramedSyncStaging(bounded) };
    await expect(resumeDesktopFramedSyncPendingPublications(resumed))
      .rejects.not.toThrow('reconnect_query_body_budget_exceeded');
    expect(source.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    expect(target.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
    expect(source.prepare('SELECT COUNT(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(before.length - 1);
    await proxy.close();
    expect(await resumeDesktopFramedSyncPendingPublications({ ...resumed,
      peerOrigin: fixture.rightSnapshot.origin })).toBe(before.length - 1);
    expect(publishedIdentities(source)).toEqual(before);
    expect(source.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(before.length);
    expect(target.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(before.length);
    const receipts = `SELECT transfer_id, content_id, receiver_device_id, receiver_library_epoch,
      applied_state_hash FROM framed_sync_receipts ORDER BY hex(transfer_id)`;
    expect(target.prepare(receipts).all()).toEqual(source.prepare(receipts).all());
    expect(source.prepare(`SELECT COUNT(*) FROM framed_sync_receipts receipt
      JOIN framed_sync_outbound_publications publication USING (transfer_id)
      WHERE receipt.content_id != publication.content_id OR receipt.receiver_device_id != publication.receiver_device_id
        OR receipt.receiver_library_epoch != publication.receiver_library_epoch`).pluck().get()).toBe(0);
    expect(source.prepare('SELECT COUNT(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
    const settings = "SELECT value_json, content_hash FROM setting_records WHERE key LIKE 'pending-budget-%' ORDER BY key";
    expect(target.prepare(settings).all()).toEqual(source.prepare(settings).all());
  } finally {
    await proxy.close();
    source.close();
    target.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 120_000);
