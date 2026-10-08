// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { applyPreparedDesktopFramedSyncInbound } from './desktopFramedSyncApplyPrepared.js';
import { loadDesktopFramedSyncReadyInbound } from './desktopFramedSyncReadyInbound.js';
import { loadDesktopFramedSyncReadySource, streamDesktopFramedSyncReadySourceFacts } from './desktopFramedSyncReadySource.js';
import { desktopResourceReadyFixture } from './desktopFramedSyncResourceReady.testSupport.js';
import { retainDesktopFramedSyncInboundForApply } from './desktopFramedSyncStateInbound.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';

it('commits a verified attachment and its independent receipt without creating article facts', async () => {
  const host = await desktopResourceReadyFixture();
  try {
    const ready = await loadDesktopFramedSyncReadySource(host.db, host.published);
    if (!ready) throw new Error('resource_ready_missing');
    const applied = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] });
    expect(applied.generatedChanges).toBe(false);
    expect(applied.receipts).toHaveLength(1);
    expect(applied.receipts[0]).toEqual(await host.staging.loadReceipt(host.published.transferId));
    expect(applied.receipts[0]!.appliedStateHash).toEqual(host.published.contentId);
    expect(host.sqlite.prepare('SELECT state, transfer_id FROM framed_sync_resource_demands').get())
      .toEqual({ state: 'verified_present', transfer_id: Buffer.from(host.published.transferId) });
    expect(await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] })).toEqual(applied);
    expect(await readFile(path.join(host.assetsDir, host.resource.storageKey))).toEqual(host.bytes);
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_resource_availability').all())
      .toEqual([{ hash: host.hash, available: 1 }]);
    for (const table of ['nodes', 'node_sync_versions', 'framed_sync_resource_pins']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
  } finally {
    host.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});

it('rolls back availability and receipt together and retains the ready attachment for retry', async () => {
  const host = await desktopResourceReadyFixture();
  try {
    const ready = await loadDesktopFramedSyncReadySource(host.db, host.published);
    if (!ready) throw new Error('resource_ready_missing');
    host.sqlite.exec(`CREATE TRIGGER reject_resource_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'resource_receipt_rejected'); END`);
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] }))
      .rejects.toThrow('resource_receipt_rejected');
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_resource_availability').all()).toEqual([]);
    expect(await host.staging.loadReceipt(host.published.transferId)).toBeNull();
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
    expect(await loadDesktopFramedSyncReadySource(host.db, host.published)).toEqual(ready);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_resource_pins').pluck().get()).toBe(1);
    host.sqlite.exec('DROP TRIGGER reject_resource_receipt');
    const retry = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] });
    expect(retry.receipts).toHaveLength(1);
    expect(await readFile(path.join(host.assetsDir, host.resource.storageKey))).toEqual(host.bytes);
  } finally {
    host.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});

it('does not commit a receipt for an attachment whose receiver demand has changed', async () => {
  const host = await desktopResourceReadyFixture();
  try {
    const ready = await loadDesktopFramedSyncReadySource(host.db, host.published);
    if (!ready) throw new Error('resource_ready_missing');
    host.sqlite.exec("UPDATE framed_sync_resource_demands SET demand_id = 'new-demand'");
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] }))
      .rejects.toThrow('framed_sync_resource_demand_mismatch');
    expect(await host.staging.loadReceipt(host.published.transferId)).toBeNull();
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_resource_availability').all()).toEqual([]);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_resource_pins').pluck().get()).toBe(1);
    expect(await loadDesktopFramedSyncReadySource(host.db, host.published)).toEqual(ready);
  } finally {
    host.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});

it.each([
  'DELETE FROM framed_sync_resource_pins',
  'UPDATE framed_sync_resource_pins SET byte_length = byte_length + 1',
  'UPDATE framed_sync_resource_pins SET role = 3',
  'UPDATE framed_sync_resource_pins SET required = 0',
  "UPDATE framed_sync_available_resources SET storage_key = 'wrong.png'",
  `INSERT INTO framed_sync_available_resources SELECT zeroblob(32), byte_length, storage_key
    FROM framed_sync_available_resources;
   INSERT INTO framed_sync_resource_pins SELECT transfer_id, zeroblob(32), byte_length, role, required, storage_key
    FROM framed_sync_resource_pins`
])('rejects inconsistent durable resource ownership before committing a result: %s', async (sql) => {
  const host = await desktopResourceReadyFixture();
  try {
    const ready = await loadDesktopFramedSyncReadySource(host.db, host.published);
    if (!ready) throw new Error('resource_ready_missing');
    host.sqlite.exec(sql);
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] }))
      .rejects.toThrow('framed_sync_resource_pin_set_mismatch');
    expect(await host.staging.loadReceipt(host.published.transferId)).toBeNull();
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_resource_availability').all()).toEqual([]);
  } finally {
    host.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});

it('recovers the frozen attachment facts and pins after closing and reopening SQLite', async () => {
  const host = await desktopResourceReadyFixture();
  let reopened: Database.Database | undefined;
  try {
    const databasePath = path.join(host.root, 'library.sqlite');
    await host.sqlite.backup(databasePath);
    host.sqlite.close();
    reopened = new Database(databasePath);
    const db = createBetterSqliteDbPort(reopened);
    const ready = await loadDesktopFramedSyncReadySource(db, host.published);
    if (!ready) throw new Error('resource_ready_missing');
    const facts = [];
    for await (const { fact } of streamDesktopFramedSyncReadySourceFacts(db, ready)) facts.push(fact);
    expect(facts).toEqual([host.fact]);
    expect((await applyVerifiedDesktopFramedSyncInbound({ db, transfers: [ready] })).receipts)
      .toHaveLength(1);
    expect(await readFile(path.join(host.assetsDir, host.resource.storageKey))).toEqual(host.bytes);
  } finally {
    if (host.sqlite.open) host.sqlite.close();
    reopened?.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});

it('retains ordinary attachment ownership through a failed receipt and retries the frozen ready unit', async () => {
  const host = await desktopResourceReadyFixture();
  try {
    const input = { db: host.db, published: host.published, staging: host.staging };
    const ready = await loadDesktopFramedSyncReadyInbound(input);
    if (!ready) throw new Error('resource_ready_missing');
    const retained = retainDesktopFramedSyncInboundForApply(ready);
    expect(retained).toEqual(ready);
    host.sqlite.exec(`CREATE TRIGGER reject_ordinary_resource_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'ordinary_resource_receipt_rejected'); END`);
    await expect(applyPreparedDesktopFramedSyncInbound({ db: host.db, transfers: [retained] }))
      .rejects.toThrow('ordinary_resource_receipt_rejected');
    expect(host.sqlite.prepare('SELECT * FROM framed_sync_resource_availability').all()).toEqual([]);
    const retry = await loadDesktopFramedSyncReadyInbound(input);
    expect(retry).toEqual(ready);
    if (!retry) throw new Error('resource_ready_missing');
    host.sqlite.exec('DROP TRIGGER reject_ordinary_resource_receipt');
    const applied = await applyPreparedDesktopFramedSyncInbound({ db: host.db, transfers: [retry] });
    expect(applied.receipts[0]!.appliedStateHash).toEqual(host.published.contentId);
    expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_version_local_source_revisions').pluck().get()).toBe(0);
    expect(await readFile(path.join(host.assetsDir, host.resource.storageKey))).toEqual(host.bytes);
  } finally {
    host.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(host.root, { recursive: true, force: true });
  }
});
