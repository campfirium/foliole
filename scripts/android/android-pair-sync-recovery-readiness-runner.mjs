#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';

const execFileAsync = promisify(execFile);
const PAIRING_PREFS = 'shared_prefs/foliole_companion_pairing.xml';

function parseArgs(argv) {
  const options = { adb: 'adb', appId: 'com.foliole.android', serial: '' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--adb' && value) options.adb = value;
    else if (key === '--serial' && value) options.serial = value;
    else if (key === '--app-id' && value) options.appId = value;
    else throw new Error('Pair sync recovery readiness accepts only fixed adb, serial, and app-id options');
  }
  return options;
}

async function pairingCredentialsPresent(options) {
  try {
    await execFileAsync(options.adb, [
      '-s', options.serial, 'shell', 'run-as', options.appId, 'test', '-f', PAIRING_PREFS
    ], { encoding: 'utf8', timeout: 30_000 });
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}

export async function runPairSyncRecoveryReadiness(options) {
  const [snapshot, credentialsPresent] = await Promise.all([
    collectAndroidDeviceSnapshot({
      ...options, databaseInspector: inspectPairSyncRecoveryWorkspace, includeEvents: false,
      tables: ['nodes', 'sync_object_state', 'companion_meta']
    }),
    pairingCredentialsPresent(options)
  ]);
  return pairSyncRecoveryReadiness(snapshot, credentialsPresent);
}

async function main() {
  const readiness = await runPairSyncRecoveryReadiness(parseArgs(process.argv.slice(2)));
  console.log(`[android-data] pair-sync-recovery-readiness=${JSON.stringify(readiness)}`);
  if (readiness.resultStatus !== 'ready') process.exitCode = 77;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
