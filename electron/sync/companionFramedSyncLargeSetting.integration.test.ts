// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { applyPreparedCompanionFramedSyncTransfers }
  from '../../src/shared/platform/companion/sync/framed/companionFramedSyncApplyPrepared.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';

import { openCompanionAdoptionFixture } from './companionFramedSyncGroupAdoption.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

async function writeLargeSetting(file: string, entries = 15_000) {
  const value = JSON.stringify(Array.from({ length: entries }, (_, index) => ({
    source: `source-${index}`, node: `node-${index}`, status: 'imported'
  })));
  const payload = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: '*',
    key: 'readwise_source_cutover_v2', platform: 'windows', scope: 'user_space', value_json: value });
  const id = 'user_space:windows:desktop:*:readwise_source_cutover_v2';
  const hash = computeSyncContentHash('setting', payload);
  const payloadJson = JSON.stringify(payload);
  const source = new Database(file);
  try {
    await createBetterSqliteDbPort(source).transaction((tx) => applySyncObjectInTransaction(tx, {
      object_type: 'setting', object_id: id, content_hash: hash, deleted_at: null,
      payload_json: payloadJson, updated_at: '2026-10-07'
    }, { hostName: 'Provider', onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
  } finally { source.close(); }
  return { hash, id, value, payloadBytes: Buffer.byteLength(payloadJson) };
}

it('discovers and atomically adopts a shared setting above one MiB without changing its value or hash', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let receiver: Awaited<ReturnType<typeof openCompanionAdoptionFixture>> | undefined;
  try {
    const setting = await writeLargeSetting(fixture.leftSnapshot.databasePath);
    expect(setting.payloadBytes).toBeGreaterThan(1024 * 1024);
    expect(setting.payloadBytes).toBeLessThan(1536 * 1024);
    receiver = await openCompanionAdoptionFixture(fixture.root, fixture.leftSnapshot);
    const inventory = await receiver.inventory();
    expect(inventory.differences.some((entry) => entry.globalId === setting.id)).toBe(true);
    for (const difference of inventory.differences) await receiver.stage(inventory, difference);
    receiver.reopen();
    const prepared = await receiver.prepare();
    const receipts = await applyPreparedCompanionFramedSyncTransfers(receiver.db, prepared, receiver.adoption);
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
    receiver.reopen();
    expect(receiver.main.prepare('SELECT value_json, content_hash FROM setting_records WHERE key = ?')
      .get('readwise_source_cutover_v2')).toEqual({ value_json: setting.value, content_hash: setting.hash });
    expect(compareFramedSyncInventories({ local: await readFramedSyncInventory(receiver.db),
      remote: inventory.remote })).toEqual([]);
    await applyPreparedCompanionFramedSyncTransfers(receiver.db, prepared);
    for (const receipt of receipts) {
      const acknowledged = await receiver.acknowledge(receipt);
      expect([...acknowledged.contentId]).toEqual([...receipt.contentId]);
    }
    const source = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try { expect(source.prepare('SELECT COUNT(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0); }
    finally { source.close(); }
  } finally {
    receiver?.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 120_000);

it('rejects an oversized discovered setting without completing adoption or acknowledging it', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let receiver: Awaited<ReturnType<typeof openCompanionAdoptionFixture>> | undefined;
  try {
    const setting = await writeLargeSetting(fixture.leftSnapshot.databasePath, 25_000);
    expect(setting.payloadBytes).toBeGreaterThan(1536 * 1024);
    receiver = await openCompanionAdoptionFixture(fixture.root, fixture.leftSnapshot);
    const inventory = await receiver.inventory();
    const difference = inventory.differences.find((entry) => entry.globalId === setting.id);
    if (!difference) throw new Error('large_setting_not_discovered');
    await expect(receiver.stage(inventory, difference))
      .rejects.toThrow('framed_sync_http_400:canonical_string_limit_exceeded');
    receiver.reopen();
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toEqual(receiver.adoption);
    expect(receiver.main.prepare("SELECT content FROM nodes WHERE id = 'old-local'").pluck().get())
      .toBe('Protected until complete adoption');
    expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    const source = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try {
      expect(source.prepare('SELECT value_json FROM setting_records WHERE key = ?').pluck()
        .get('readwise_source_cutover_v2')).toBe(setting.value);
      expect(source.prepare('SELECT COUNT(*) FROM framed_sync_outbound_fact_refs WHERE global_id = ?')
        .pluck().get(setting.id)).toBe(0);
    } finally { source.close(); }
  } finally {
    receiver?.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 120_000);
