#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';

import { diagnoseAndroidSyncTopology } from '../android/android-sync-topology.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: windows-android-lab-sync-topology --pairing-state <json|path> --sync-state <json|path> --windows-client <json|path> --executor-device-id <id>');
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function readJsonValue(value) {
  const source = fs.existsSync(value) ? fs.readFileSync(value, 'utf8') : value;
  return JSON.parse(source);
}

if (process.argv[1]?.endsWith('windows-android-lab-sync-topology.mjs')) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = diagnoseAndroidSyncTopology({
      executorDeviceId: args['executor-device-id'],
      pairingState: readJsonValue(args['pairing-state']),
      syncState: readJsonValue(args['sync-state']),
      windowsClient: readJsonValue(args['windows-client'])
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[sync-topology] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
