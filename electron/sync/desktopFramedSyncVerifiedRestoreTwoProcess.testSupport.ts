import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { materializeCompressedSqliteBackup } from '../database/compressedSqliteBackup.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';

import { verifiedReceiverArticle } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

const receiverSettingValue = '{"theme":"light","fontSize":19}';
const sourceSettingValue = '{"theme":"dark","fontSize":12}';
const globalSettings = [
  { key: 'review_scheduler_settings', source: '{"desiredRetention":0.9}', receiver: '{"desiredRetention":0.75}' },
  { key: 'search_aliases_document', source: '{"version":1,"text":"source | 来源\\n"}',
    receiver: '{"version":1,"text":"receiver | 本机\\n"}' },
  { key: 'system_entry_display_names', source: '{"customDisplayNameById":{"inbox":"Source inbox"},"version":1}',
    receiver: '{"customDisplayNameById":{"inbox":"Receiver inbox"},"version":1}' }
] as const;

export async function seedOverwriteGlobalSettings(databasePath: string, owner: 'source' | 'receiver') {
  const sqlite = new Database(databasePath);
  try {
    await createBetterSqliteDbPort(sqlite).transaction(async (tx) => {
      for (const setting of globalSettings) {
        const payload = buildCanonicalSettingSyncPayload({ scope: 'user_space', platform: 'windows',
          form_factor: 'desktop', host_name: '*', key: setting.key, value_json: setting[owner] });
        await applySyncObjectInTransaction(tx, { object_type: 'setting',
          object_id: `user_space:windows:desktop:*:${setting.key}`, content_hash: computeSyncContentHash('setting', payload),
          deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-08T01:00:00.000Z'
        }, { onPayloadAppliedInTransaction: materializeDesktopSettingRecord });
      }
    });
  } finally { sqlite.close(); }
}

export function assertOverwriteGlobalSettings(databasePath: string, owner: 'source' | 'receiver') {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    for (const setting of globalSettings) {
      expect(sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(setting.key))
        .toEqual([{ value: setting[owner] }]);
      expect(sqlite.prepare(`SELECT scope, host_name, value_json FROM setting_records
        WHERE key = ? AND scope = 'user_space' AND platform = 'windows' AND form_factor = 'desktop' AND host_name = '*'`)
        .all(setting.key)).toEqual([{ scope: 'user_space', host_name: '*', value_json: setting[owner] }]);
    }
  } finally { sqlite.close(); }
}

async function seedOverwriteSetting(databasePath: string, value: string) {
  const sqlite = new Database(databasePath);
  try {
    const storedHost = sqlite.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get() as string;
    const hostName = JSON.parse(storedHost) as string;
    const settingId = `host:windows:desktop:${hostName}:app_settings`;
    const payload = buildCanonicalSettingSyncPayload({ scope: 'host', platform: 'windows',
      form_factor: 'desktop', host_name: hostName, key: 'app_settings', value_json: value });
    await createBetterSqliteDbPort(sqlite).transaction((tx) => applySyncObjectInTransaction(tx, {
      object_type: 'setting', object_id: settingId, content_hash: computeSyncContentHash('setting', payload),
      deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-08T01:00:00.000Z'
    }, { hostName, onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
    sqlite.prepare("UPDATE sync_object_state SET sync_dirty = 1 WHERE object_type = 'setting' AND object_id = ?")
      .run(settingId);
  } finally { sqlite.close(); }
}

function overwriteSettingRows(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      settings: sqlite.prepare("SELECT * FROM settings WHERE key = 'app_settings'").all(),
      records: sqlite.prepare("SELECT * FROM setting_records WHERE key = 'app_settings'").all(),
      state: sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE '%:app_settings'").all()
    };
  } finally { sqlite.close(); }
}

export async function seedOverwriteSettings(sourcePath: string, receiverPath: string) {
  await seedOverwriteSetting(sourcePath, sourceSettingValue);
  await seedOverwriteSetting(receiverPath, receiverSettingValue);
  const baseline = overwriteSettingRows(receiverPath);
  expect(baseline.settings).toHaveLength(1);
  expect(baseline.records).toHaveLength(1);
  expect(baseline.state).toHaveLength(1);
  expect(baseline).not.toEqual(overwriteSettingRows(sourcePath));
  return baseline;
}

export function assertOverwriteSettingsPreserved(databasePath: string, baseline: ReturnType<typeof overwriteSettingRows>) {
  const actual = overwriteSettingRows(databasePath);
  expect(actual).toEqual(baseline);
  expect(actual.settings).toEqual([expect.objectContaining({ value: receiverSettingValue })]);
  expect(actual.records).toEqual([expect.objectContaining({ value_json: receiverSettingValue })]);
  expect(actual.settings).not.toEqual([expect.objectContaining({ value: sourceSettingValue })]);
}

export function restoreBusinessRows(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
      'content_blobs', 'node_version_local_proof_state',
      'node_version_local_source_revisions', 'node_version_device_revisions', 'node_version_local_origins',
      'node_version_local_holds', 'parent_child_order', 'sync_group_metadata', 'sync_group_restore_events',
      'search_index_invalidations', 'framed_sync_inventory', 'framed_sync_version_summary',
      'framed_sync_fact_summary', 'framed_sync_resource_availability', 'framed_sync_receipts']
      .map((table) => ({ table, rows: sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() }));
  } finally { sqlite.close(); }
}

export function restoreIdentityState(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      metadata: sqlite.prepare('SELECT key, value FROM sync_group_metadata ORDER BY key').all(),
      restores: sqlite.prepare('SELECT restore_id, applied_at FROM sync_group_restore_events ORDER BY restore_id').all()
    };
  } finally { sqlite.close(); }
}

export function overwriteProgressRow(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return sqlite.prepare<[string], { value: string; updated_at: string }>(
      'SELECT value, updated_at FROM sync_group_metadata WHERE key = ?').get('sync_group_overwrite_progress');
  } finally { sqlite.close(); }
}

export function receiptCountForStateHash(databasePath: string, hash: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return sqlite.prepare<[Buffer], { count: number }>(
      'SELECT count(*) AS count FROM framed_sync_receipts WHERE applied_state_hash = ?')
      .get(Buffer.from(hash, 'hex'))?.count;
  } finally { sqlite.close(); }
}

export function installReceiptFailure(databasePath: string, rejectAfterReceipts = 0) {
  if (!Number.isSafeInteger(rejectAfterReceipts) || rejectAfterReceipts < 0) throw new Error('fixture_receipt_threshold_invalid');
  const sqlite = new Database(databasePath);
  try {
    sqlite.exec(`CREATE TRIGGER reject_identity_restore_receipt BEFORE INSERT ON framed_sync_receipts
      WHEN (SELECT count(*) FROM framed_sync_receipts) >= ${rejectAfterReceipts}
      BEGIN SELECT RAISE(ABORT, 'identity_restore_receipt_rejected'); END`);
  } finally { sqlite.close(); }
}

export function continueAfterReceiptFailure(databasePath: string, completedNodeId: string) {
  const sqlite = new Database(databasePath);
  try {
    sqlite.exec('DROP TRIGGER reject_identity_restore_receipt');
    sqlite.exec(`CREATE TRIGGER protect_completed_restore_unit BEFORE DELETE ON nodes
      WHEN OLD.id = '${completedNodeId.replaceAll("'", "''")}'
      BEGIN SELECT RAISE(ABORT, 'completed_restore_unit_cleared_again'); END`);
  } finally { sqlite.close(); }
}

export async function preservedRestoreArticle(directory: string, root: string, nodeId: string) {
  const names = await fs.readdir(directory);
  const backup = names.find((name) => /\.db(?:\.gz)?$/u.test(name));
  if (!backup) throw new Error('two_process_restore_safety_backup_missing');
  const opened = await materializeCompressedSqliteBackup(path.join(directory, backup), root);
  try { return await verifiedReceiverArticle(opened.databasePath, nodeId); }
  finally { await opened.cleanup(); }
}
