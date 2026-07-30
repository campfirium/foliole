#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  diagnoseAndroidSyncTopology,
  extractSyncStateFromSqliteBytes,
  parseAndroidSharedPreferences
} from '../android/android-sync-topology.mjs';

const execFileAsync = promisify(execFile);
const APP_ID = 'com.foliole.android';
const DATABASE_CANDIDATES = ['databases/foliole-companionSQLite.db', 'databases/foliole-companion.db'];
const PAIRING_PREFS = 'shared_prefs/foliole_companion_pairing.xml';

function trimText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pairingStateFromPrefs(values) {
  return {
    device_id: trimText(values.device_id),
    device_name: trimText(values.device_name),
    primary_device_id: trimText(values.primary_device_id),
    remote_peer_id: trimText(values.remote_peer_id),
    remote_peer_name: trimText(values.remote_peer_name),
    remote_peer_platform: trimText(values.remote_peer_platform)
  };
}

async function adb(adbPath, serial, args, options = {}) {
  const port = process.env.FOLIOLE_ANDROID_ADB_SERVER_PORT;
  const result = await execFileAsync(adbPath, [...(port ? ['-P', port] : []), '-s', serial, ...args], {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 8_000_000,
    timeout: options.timeoutMs ?? 60_000
  });
  return result.stdout;
}

async function readDeviceFile(adbPath, serial, devicePath, options = {}) {
  return adb(adbPath, serial, ['exec-out', 'run-as', APP_ID, 'cat', devicePath], options);
}

async function readAndroidDatabase(adbPath, serial) {
  let lastError = null;
  for (const candidate of DATABASE_CANDIDATES) {
    try {
      const stdout = await readDeviceFile(adbPath, serial, candidate, { encoding: 'buffer' });
      if (stdout.subarray(0, 16).toString('utf8') === 'SQLite format 3\0') return stdout;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Android companion database is unreadable${lastError ? `: ${lastError.message}` : ''}`);
}

async function collectTopology() {
  const adbPath = process.env.FOLIOLE_ANDROID_ADB_PATH || process.env.ANDROID_ADB || 'adb';
  const serial = process.env.FOLIOLE_ANDROID_SERIAL;
  if (!serial) throw new Error('FOLIOLE_ANDROID_SERIAL is required');
  const pairingXml = await readDeviceFile(adbPath, serial, PAIRING_PREFS);
  const pairingState = pairingStateFromPrefs(parseAndroidSharedPreferences(pairingXml));
  const syncState = extractSyncStateFromSqliteBytes(await readAndroidDatabase(adbPath, serial));
  const executorDeviceId = trimText(await adb(adbPath, serial, ['shell', 'getprop', 'ro.serialno']));
  return diagnoseAndroidSyncTopology({
    executorDeviceId,
    pairingState,
    syncState,
    windowsClient: {}
  });
}

if (process.argv[1]?.endsWith('windows-android-lab-sync-topology-collect.mjs')) {
  collectTopology()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`[sync-topology-collect] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
