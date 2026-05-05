/* global console, process */

import Database from 'better-sqlite3';
import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_APP_ID = 'com.foliole.android';
const DEVICE_DB_PATH = 'databases/foliole-companion.db';
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

No database backup is written; this is a repeatable test reset tool.`);
}

function adbCandidates(adbPath) {
  if (adbPath !== 'adb') return [adbPath];
  const candidates = ['adb', 'adb.exe'];
  for (const sdkRoot of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (sdkRoot) candidates.push(path.join(sdkRoot, 'platform-tools', 'adb'));
  }
  candidates.push(path.join('/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  return [...new Set(candidates)];
}

async function runAdb(options, args, execOptions = {}) {
  const adbArgs = options.serial ? ['-s', options.serial, ...args] : args;
  let lastError = null;
  for (const adbPath of adbCandidates(options.adb)) {
    try {
      return await execFileAsync(adbPath, adbArgs, { maxBuffer: 1024 * 1024 * 80, ...execOptions });
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw lastError;
}

async function spawnAdb(options, args, input) {
  const adbArgs = options.serial ? ['-s', options.serial, ...args] : args;
  let lastError = null;
  for (const adbPath of adbCandidates(options.adb)) {
    try {
      await spawnWithInput(adbPath, adbArgs, input);
      return;
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw lastError;
}

function spawnWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
    });
    child.stdin.end(input);
  });
}

async function resolveSerial(options) {
  if (options.serial) return options.serial;
  const { stdout } = await runAdb({ ...options, serial: '' }, ['devices'], { encoding: 'utf8' });
  const line = stdout.split(/\r?\n/).find((entry) => /\bdevice$/.test(entry.trim()));
  if (!line) throw new Error('No ready Android emulator/device found.');
  return line.trim().split(/\s+/)[0];
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

async function pullDeviceDatabase(options, destination) {
  const { stdout } = await runAdb(
    options,
    ['exec-out', 'run-as', options.appId, 'cat', DEVICE_DB_PATH],
    { encoding: 'buffer' }
  );
  await writeFile(destination, stdout);
}

async function writeDeviceDatabase(options, databasePath) {
  const body = await readFile(databasePath);
  await runAdb(options, ['shell', 'am', 'force-stop', options.appId]);
  await spawnAdb(options, ['exec-in', 'run-as', options.appId, 'sh', '-c', `cat > ${DEVICE_DB_PATH}`], body);
  await runAdb(options, ['shell', 'run-as', options.appId, 'rm', '-f', `${DEVICE_DB_PATH}-wal`, `${DEVICE_DB_PATH}-shm`]);
  await runAdb(options, ['shell', 'run-as', options.appId, 'rm', '-rf', 'files/attachments']);
  await runAdb(options, ['shell', 'run-as', options.appId, 'mkdir', '-p', 'files/attachments']);
}

async function run(options) {
  if (options.help) {
    printHelp();
    return;
  }
  const serial = await resolveSerial(options);
  const resolved = { ...options, serial };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-reset-sync-data-'));
  const workingPath = path.join(tempDir, 'foliole-companion-reset.db');
  try {
    await pullDeviceDatabase(resolved, workingPath);
    const result = resetSyncDataInDatabase(workingPath, resolved);
    await writeDeviceDatabase(resolved, workingPath);
    const verifyPath = path.join(tempDir, 'foliole-companion-after-reset.db');
    await pullDeviceDatabase(resolved, verifyPath);
    const verified = inspectSyncDataCounts(verifyPath);
    console.log(JSON.stringify({ reset: result, serial, verified }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run(parseArgs(process.argv.slice(2)));
}
