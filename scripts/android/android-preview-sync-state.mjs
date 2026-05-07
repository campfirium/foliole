/* global console, process */

import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSerial, runAdb } from './android-adb-command.mjs';

const DEFAULT_APP_ID = 'com.foliole.android';
const DATABASE_CANDIDATES = [
  'databases/foliole-companionSQLite.db',
  'databases/foliole-companion.db'
];
const PAIRING_PREFS_PATH = 'shared_prefs/foliole_companion_pairing.xml';

function parseArgs(argv) {
  const options = {
    adb: process.env.ANDROID_ADB || 'adb',
    appId: DEFAULT_APP_ID,
    serial: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--adb' && value) options.adb = value;
    if (key === '--app-id' && value) options.appId = value;
    if (key === '--serial' && value) options.serial = value;
    if (key.startsWith('--') && value) index += 1;
  }
  return options;
}

async function readDeviceFile(options, devicePath) {
  const { stdout } = await runAdb(
    options,
    ['exec-out', 'run-as', options.appId, 'cat', devicePath],
    { encoding: 'buffer' }
  );
  return stdout;
}

async function pullFirstDatabase(options, outputDir) {
  for (const devicePath of DATABASE_CANDIDATES) {
    try {
      const body = await readDeviceFile(options, devicePath);
      const outputPath = path.join(outputDir, path.basename(devicePath));
      await writeFile(outputPath, body);
      return { devicePath, outputPath };
    } catch {
      // Try the next historical database file name.
    }
  }
  return null;
}

function tableExists(database, table) {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function countRows(database, table) {
  return tableExists(database, table)
    ? database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    : null;
}

function readEndpoint(database) {
  if (!tableExists(database, 'companion_meta')) return null;
  return database
    .prepare("SELECT value FROM companion_meta WHERE key = 'workspace_sync_endpoint_url'")
    .get()?.value ?? null;
}

async function readPairingPresence(options) {
  try {
    const body = await readDeviceFile(options, PAIRING_PREFS_PATH);
    const xml = body.toString('utf8');
    return /pairing_device_id/.test(xml) && /pairing_device_secret/.test(xml);
  } catch {
    return false;
  }
}

async function inspectPreviewSyncState(options) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-preview-sync-state-'));
  try {
    const serial = await resolveSerial(options);
    const resolved = { ...options, serial };
    const pairingPresent = await readPairingPresence(resolved);
    const pulled = await pullFirstDatabase(resolved, tempDir);
    if (!pulled) {
      return {
        database: null,
        endpointPresent: false,
        nodeOrderRows: null,
        nodes: null,
        pairingPresent,
        serial,
        status: 'NO_DATABASE'
      };
    }
    const database = new Database(pulled.outputPath, { readonly: true, fileMustExist: true });
    try {
      const endpoint = readEndpoint(database);
      const nodes = countRows(database, 'nodes');
      const nodeOrderRows = countRows(database, 'node_order');
      return {
        database: pulled.devicePath,
        endpointPresent: typeof endpoint === 'string' && endpoint.trim().length > 0,
        nodeOrderRows,
        nodes,
        pairingPresent,
        serial,
        status: endpoint && pairingPresent ? 'SYNC_READY' : 'SYNC_NOT_READY'
      };
    } finally {
      database.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function printResult(result) {
  console.log(`[android-preview-sync-state] serial=${result.serial}`);
  console.log(`[android-preview-sync-state] database=${result.database ?? 'missing'}`);
  console.log(`[android-preview-sync-state] endpoint=${result.endpointPresent ? 'present' : 'missing'} pairing=${result.pairingPresent ? 'present' : 'missing'}`);
  console.log(`[android-preview-sync-state] nodes=${result.nodes ?? 'unknown'} node_order=${result.nodeOrderRows ?? 'unknown'}`);
  console.log(`[android-preview-sync-state] status: ${result.status}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  inspectPreviewSyncState(parseArgs(process.argv.slice(2)))
    .then(printResult)
    .catch((error) => {
      console.error(`[android-preview-sync-state] status: FAILED ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

export { inspectPreviewSyncState };
