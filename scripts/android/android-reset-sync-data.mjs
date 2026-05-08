/* global console, process */

import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';

import { resolveSerial } from './android-adb-command.mjs';
import {
  pullResetDeviceDatabase,
  writeResetDeviceDatabase
} from './android-reset-sync-device-database.mjs';

const DEFAULT_APP_ID = 'com.foliole.android';
const RESET_CONFIRM_ENV = 'FOLIOLE_ANDROID_ALLOW_SYNC_DATA_RESET';
const PRESERVED_COMPANION_META_KEYS = [
  'device_id',
  'workspace_sync_endpoint_url',
  'workspace_sync_onboarding_status',
  'workspace_sync_remembered_targets'
];
const CLEARED_TABLES = [
  'sync_push_ack',
  'sync_peer_cursors',
  'sync_change_log',
  'sync_object_state',
  'node_sync_conflicts',
  'node_sync_versions',
  'node_view_state',
  'node_reading_device_state',
  'node_order',
  'node_attachments',
  'attachment_blobs',
  'attachments',
  'pdf_page_text',
  'content_blob_data',
  'content_blobs',
  'external_documents',
  'external_search_folders',
  'import_sources',
  'review_log',
  'node_reading',
  'node_review',
  'setting_records',
  'nodes',
  'workspace_meta'
];

function parseArgs(argv) {
  const options = {
    adb: process.env.ANDROID_ADB || 'adb',
    appId: DEFAULT_APP_ID,
    preferAdbReverse: false,
    serial: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--help') options.help = true;
    if (key === '--adb' && value) options.adb = value;
    if (key === '--app-id' && value) options.appId = value;
    if (key === '--prefer-adb-reverse') {
      options.preferAdbReverse = true;
      continue;
    }
    if (key === '--serial' && value) options.serial = value;
    if (key.startsWith('--') && value) index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: npm run android:reset-sync-data -- [--serial emulator-5554]

Resets Android companion sync data for a cold resync test without unpairing:
- keeps Android app data, SharedPreferences, Keystore, device id, endpoint, and remembered targets
- clears synced nodes, external documents, content manifests, bodies, attachments, review state, settings, cursors, dirty state, and sync events
- removes files/attachments
- optionally rewrites emulator 10.0.2.2 endpoints to 127.0.0.1 with --prefer-adb-reverse

No database backup is written; this is a repeatable test reset tool.
Set ${RESET_CONFIRM_ENV}=1 to run it against a connected device.`);
}

export function inspectSyncDataCounts(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return readSyncDataCounts(database);
  } finally {
    database.close();
  }
}

function readSyncDataCounts(database) {
  return {
    attachmentBlobs: tableCount(database, 'attachment_blobs'),
    attachments: tableCount(database, 'attachments'),
    companionMeta: tableCount(database, 'companion_meta'),
    contentBlobData: tableCount(database, 'content_blob_data'),
    contentBlobs: tableCount(database, 'content_blobs'),
    externalDocuments: tableCount(database, 'external_documents'),
    importSources: tableCount(database, 'import_sources'),
    nodes: tableCount(database, 'nodes'),
    preservedMeta: readCompanionMeta(database),
    reviewLog: tableCount(database, 'review_log'),
    settings: tableCount(database, 'setting_records'),
    syncObjectState: tableCount(database, 'sync_object_state'),
    syncPushAck: tableCount(database, 'sync_push_ack'),
    workspaceMeta: tableCount(database, 'workspace_meta')
  };
}

function tableCount(database, table) {
  if (!tableExists(database, table)) return 0;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function tableExists(database, table) {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function readCompanionMeta(database) {
  if (!tableExists(database, 'companion_meta')) return {};
  return Object.fromEntries(database.prepare('SELECT key, value FROM companion_meta ORDER BY key').all().map((row) => [row.key, row.value]));
}

export function resetSyncDataInDatabase(databasePath, options = {}) {
  const database = new Database(databasePath, { fileMustExist: true });
  try {
    const before = readSyncDataCounts(database);
    let endpointRewrite = null;
    database.transaction(() => {
      for (const table of CLEARED_TABLES) {
        if (tableExists(database, table)) database.prepare(`DELETE FROM ${table}`).run();
      }
      if (tableExists(database, 'companion_meta')) {
        const placeholders = PRESERVED_COMPANION_META_KEYS.map(() => '?').join(', ');
        database.prepare(`DELETE FROM companion_meta WHERE key NOT IN (${placeholders})`).run(...PRESERVED_COMPANION_META_KEYS);
        endpointRewrite = maybeRewriteEndpointForAdbReverse(database, before.preservedMeta, options);
      }
    })();
    database.prepare('VACUUM').run();
    const after = readSyncDataCounts(database);
    assertResetResult(before, after, endpointRewrite);
    return { after, before, clearedTables: CLEARED_TABLES, endpointRewrite, preservedCompanionMetaKeys: PRESERVED_COMPANION_META_KEYS };
  } finally {
    database.close();
  }
}

function maybeRewriteEndpointForAdbReverse(database, preservedMeta, options) {
  if (!options.preferAdbReverse) return null;
  const endpoint = rewriteEmulatorHost(preservedMeta.workspace_sync_endpoint_url);
  if (!endpoint) return null;
  const now = new Date().toISOString();
  database.prepare("UPDATE companion_meta SET value = ?, updated_at = ? WHERE key = 'workspace_sync_endpoint_url'")
    .run(endpoint, now);
  if (preservedMeta.workspace_sync_remembered_targets) {
    database.prepare("UPDATE companion_meta SET value = ?, updated_at = ? WHERE key = 'workspace_sync_remembered_targets'")
      .run(JSON.stringify([endpoint]), now);
  }
  return { from: preservedMeta.workspace_sync_endpoint_url, to: endpoint };
}

function rewriteEmulatorHost(endpointUrl) {
  if (!endpointUrl) return null;
  try {
    const url = new URL(endpointUrl);
    if (url.hostname !== '10.0.2.2') return null;
    url.hostname = '127.0.0.1';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function assertResetResult(before, after, endpointRewrite) {
  if (before.preservedMeta.device_id && after.preservedMeta.device_id !== before.preservedMeta.device_id) {
    throw new Error('Reset changed Android device identity.');
  }
  if (
    before.preservedMeta.workspace_sync_endpoint_url &&
    after.preservedMeta.workspace_sync_endpoint_url !== (endpointRewrite?.to ?? before.preservedMeta.workspace_sync_endpoint_url)
  ) {
    throw new Error('Reset changed workspace sync endpoint.');
  }
  const nonEmpty = Object.entries(after).filter(([key, value]) => key !== 'companionMeta' && key !== 'preservedMeta' && value !== 0);
  if (nonEmpty.length > 0) {
    throw new Error(`Reset left sync data behind: ${nonEmpty.map(([key, value]) => `${key}=${value}`).join(', ')}`);
  }
}

async function run(options) {
  if (options.help) {
    printHelp();
    return;
  }
  if (!isResetConfirmed(process.env)) {
    console.error(`[android-reset-sync-data] refused: this command clears synced Android app data for ${options.appId}.`);
    console.error(`[android-reset-sync-data] set ${RESET_CONFIRM_ENV}=1 after backing up or using a disposable emulator.`);
    process.exit(2);
  }
  const serial = await resolveSerial(options);
  const resolved = { ...options, serial };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-reset-sync-data-'));
  const workingPath = path.join(tempDir, 'foliole-companion-reset.db');
  try {
    const pulled = await pullResetDeviceDatabase(resolved, workingPath);
    const result = resetSyncDataInDatabase(workingPath, resolved);
    await writeResetDeviceDatabase(resolved, workingPath, pulled.devicePath);
    const verifyPath = path.join(tempDir, 'foliole-companion-after-reset.db');
    await pullResetDeviceDatabase(resolved, verifyPath);
    const verified = inspectSyncDataCounts(verifyPath);
    console.log(JSON.stringify({ database: pulled.devicePath, reset: result, serial, verified }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function isResetConfirmed(env) {
  return env[RESET_CONFIRM_ENV] === '1';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run(parseArgs(process.argv.slice(2)));
}
