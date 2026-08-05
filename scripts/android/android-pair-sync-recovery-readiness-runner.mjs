#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';

const execFileAsync = promisify(execFile);
const PAIRING_PREFS = 'shared_prefs/foliole_companion_pairing.xml';
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const PAIRING_REQUIRED_KEYS = ['device_id', 'device_secret', 'device_secret_iv'];

function quoteAdbShellScript(script) {
  return JSON.stringify(script);
}

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

export async function inspectPairingPreferences(options, run = execFileAsync) {
  try {
    await run(options.adb, [
      '-s', options.serial, 'shell', 'run-as', options.appId, 'test', '-f', PAIRING_PREFS
    ], { encoding: 'utf8', timeout: 30_000 });
  } catch (error) {
    if (error.code === 1) return { pairingCredentialsPresent: false, remotePeerFingerprint: null };
    throw error;
  }
  const requiredKeys = await Promise.all(PAIRING_REQUIRED_KEYS.map(async (key) => {
    try {
      const script = quoteAdbShellScript(`grep -q 'name="${key}"' ${PAIRING_PREFS}`);
      await run(options.adb, [
        '-s', options.serial, 'shell', 'run-as', options.appId, 'sh', '-c', script
      ], { encoding: 'utf8', timeout: 30_000 });
      return true;
    } catch (error) {
      if (error.code === 1) return false;
      throw error;
    }
  }));
  if (requiredKeys.every((present) => !present)) {
    return { pairingCredentialsPresent: false, remotePeerFingerprint: null };
  }
  if (!requiredKeys.every(Boolean)) {
    return { pairingCredentialsPresent: true, remotePeerFingerprint: null };
  }
  const hashes = await Promise.all(['remote_peer_id', 'primary_device_id'].map(async (key) => {
    const script = quoteAdbShellScript(
      `sed -n 's@.*<string name="${key}">\\([^<]*\\)</string>.*@\\1@p' ${PAIRING_PREFS} | sha256sum`
    );
    const result = await run(options.adb, [
      '-s', options.serial, 'shell', 'run-as', options.appId, 'sh', '-c', script
    ], { encoding: 'utf8', timeout: 30_000 });
    const hash = /^([0-9a-f]{64})\b/mu.exec(result.stdout)?.[1] ?? null;
    return hash && hash !== EMPTY_SHA256 ? hash.slice(0, 16) : null;
  }));
  const peers = [...new Set(hashes.filter(Boolean))];
  return {
    pairingCredentialsPresent: true,
    pairingPeerConflict: peers.length > 1,
    remotePeerFingerprint: peers.length === 1 ? peers[0] : null
  };
}

export async function runPairSyncRecoveryReadiness(options) {
  const [snapshot, pairing] = await Promise.all([
    collectAndroidDeviceSnapshot({
      ...options, databaseInspector: inspectPairSyncRecoveryWorkspace, includeEvents: false,
      tables: ['nodes', 'sync_object_state', 'companion_meta']
    }),
    inspectPairingPreferences(options)
  ]);
  return pairSyncRecoveryReadiness(
    snapshot, pairing.pairingCredentialsPresent, pairing.remotePeerFingerprint,
    pairing.pairingPeerConflict
  );
}

async function main() {
  const readiness = await runPairSyncRecoveryReadiness(parseArgs(process.argv.slice(2)));
  console.log(`[android-data] pair-sync-recovery-readiness=${JSON.stringify(readiness)}`);
  if (readiness.resultStatus !== 'ready') process.exitCode = 77;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
