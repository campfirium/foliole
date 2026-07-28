/* global console, process, setTimeout */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSerial, runAdb } from './android-adb-command.mjs';
import { openReadonlySqliteDatabase } from './sqlite-readonly.mjs';

const DEFAULT_APP_ID = 'com.foliole.android';
const DATABASE_CANDIDATES = [
  'databases/foliole-companionSQLite.db',
  'databases/foliole-companion.db'
];
const DATABASE_SIDECAR_SUFFIXES = ['-wal', '-shm'];
const SQLITE_READ_RETRY_DELAYS_MS = [250, 750, 1500, 2500];
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

function databaseSnapshotPaths(devicePath, outputDir) {
  const outputPath = path.join(outputDir, path.basename(devicePath));
  return [
    { devicePath, outputPath },
    ...DATABASE_SIDECAR_SUFFIXES.map((suffix) => ({
      devicePath: `${devicePath}${suffix}`,
      outputPath: `${outputPath}${suffix}`
    }))
  ];
}

async function pullDatabaseSnapshot(options, devicePath, outputDir) {
  const [main, ...sidecars] = databaseSnapshotPaths(devicePath, outputDir);
  const body = await readDeviceFile(options, main.devicePath);
  await writeFile(main.outputPath, body);
  for (const sidecar of sidecars) {
    try {
      const sidecarBody = await readDeviceFile(options, sidecar.devicePath);
      if (sidecarBody.length > 0) await writeFile(sidecar.outputPath, sidecarBody);
    } catch {
      // WAL/SHM files are optional; copy them when present for a more consistent snapshot.
    }
  }
  return { devicePath, outputPath: main.outputPath };
}

async function pullFirstDatabase(options, outputDir) {
  for (const devicePath of DATABASE_CANDIDATES) {
    try {
      return await pullDatabaseSnapshot(options, devicePath, outputDir);
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

function isReadonlySqliteUnreadableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:database disk image is malformed|file is not a database|sqlite open failed)/iu.test(message);
}

function unreadableResult(base, error) {
  return {
    ...base,
    databaseError: error instanceof Error ? error.message : String(error),
    endpointPresent: false,
    nodeOrderRows: null,
    nodes: null,
    status: 'DATABASE_UNREADABLE'
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readPairingPresence(options) {
  try {
    const body = await readDeviceFile(options, PAIRING_PREFS_PATH);
    const xml = body.toString('utf8');
    return hasPairingCredentials(xml);
  } catch {
    return false;
  }
}

function hasPairingCredentials(xml) {
  const hasDeviceId = /name="(?:pairing_)?device_id"/.test(xml);
  const hasDeviceSecret = /name="(?:pairing_)?device_secret"/.test(xml);
  return hasDeviceId && hasDeviceSecret;
}

async function inspectPulledDatabase(pulled, base) {
  const database = await openReadonlySqliteDatabase(pulled.outputPath);
  try {
    const endpoint = readEndpoint(database);
    const nodes = countRows(database, 'nodes');
    const nodeOrderRows = countRows(database, 'node_order');
    return {
      ...base,
      endpointPresent: typeof endpoint === 'string' && endpoint.trim().length > 0,
      nodeOrderRows,
      nodes,
      status: endpoint && base.pairingPresent ? 'SYNC_READY' : 'SYNC_NOT_READY'
    };
  } finally {
    database.close();
  }
}

async function inspectPreviewSyncState(options) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-preview-sync-state-'));
  try {
    const serial = await resolveSerial(options);
    const resolved = { ...options, serial };
    const pairingPresent = await readPairingPresence(resolved);
    let lastUnreadable = null;
    for (let attempt = 0; attempt <= SQLITE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
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
      const base = { database: pulled.devicePath, pairingPresent, readAttempts: attempt + 1, serial };
      try {
        return await inspectPulledDatabase(pulled, base);
      } catch (error) {
        if (!isReadonlySqliteUnreadableError(error)) throw error;
        lastUnreadable = unreadableResult(base, error);
        const delay = SQLITE_READ_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await sleep(delay);
      }
    }
    return lastUnreadable;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function printResult(result) {
  console.log(`[android-preview-sync-state] serial=${result.serial}`);
  console.log(`[android-preview-sync-state] database=${result.database ?? 'missing'}`);
  console.log(`[android-preview-sync-state] endpoint=${result.endpointPresent ? 'present' : 'missing'} pairing=${result.pairingPresent ? 'present' : 'missing'}`);
  console.log(`[android-preview-sync-state] nodes=${result.nodes ?? 'unknown'} node_order=${result.nodeOrderRows ?? 'unknown'}`);
  if (result.databaseError) console.log(`[android-preview-sync-state] database_error=${result.databaseError}`);
  if (result.readAttempts) console.log(`[android-preview-sync-state] read_attempts=${result.readAttempts}`);
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

export {
  databaseSnapshotPaths,
  hasPairingCredentials,
  inspectPreviewSyncState,
  isReadonlySqliteUnreadableError
};
