// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../../../../../lib/core/sync/canonicalPrivateStatePayload.js';
import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { materializeDesktopSettingRecord } from '../../../../../../electron/database/desktopSettingMaterializer.js';

let receiver: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await receiver?.close(); receiver = undefined; });

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

it('receives a shared setting above one MiB through ordinary sync without changing its value or hash', async () => {
  receiver = await createCompanionRequestFixture();
  const setting = await writeLargeSetting(receiver.fixture.rightSnapshot.databasePath);
  expect(setting.payloadBytes).toBeGreaterThan(1024 * 1024);
  expect(setting.payloadBytes).toBeLessThan(1536 * 1024);
  expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
  await receiver.restart();
  expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
  expect(receiver.sqlite.prepare('SELECT value_json, content_hash FROM setting_records WHERE key = ?')
    .get('readwise_source_cutover_v2')).toEqual({ value_json: setting.value, content_hash: setting.hash });
  expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
  expect(receiver.sqlite.prepare('SELECT value_json, content_hash FROM setting_records WHERE key = ?')
    .get('readwise_source_cutover_v2')).toEqual({ value_json: setting.value, content_hash: setting.hash });
}, 120_000);

it('rejects an oversized setting during ordinary sync without changing local data or acknowledging it', async () => {
  receiver = await createCompanionRequestFixture();
  await receiver.fixture.left.seed({ nodeId: 'old-local', title: 'Protected', content: 'Protected until complete adoption' });
  const setting = await writeLargeSetting(receiver.fixture.rightSnapshot.databasePath, 25_000);
  expect(setting.payloadBytes).toBeGreaterThan(1536 * 1024);
  const before = receiver.sqlite.prepare('SELECT * FROM setting_records').all();
  await expect(receiver.sync()).rejects.toThrow('canonical_string_limit_exceeded');
  await receiver.restart();
  expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
  expect(receiver.sqlite.prepare("SELECT content FROM nodes WHERE id = 'old-local'").pluck().get())
    .toBe('Protected until complete adoption');
  expect(receiver.sqlite.prepare('SELECT * FROM setting_records').all()).toEqual(before);
  expect(receiver.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_receipts'").get()).toBeUndefined();
  const source = new Database(receiver.fixture.rightSnapshot.databasePath, { readonly: true });
  try {
    expect(source.prepare('SELECT value_json FROM setting_records WHERE key = ?').pluck()
      .get('readwise_source_cutover_v2')).toBe(setting.value);
    expect(source.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_outbound_fact_refs'").get()).toBeUndefined();
  } finally { source.close(); }
}, 120_000);
