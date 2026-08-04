#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  captureAnnotationReadiness, inspectCaptureAnnotationWorkspace
} from './android-capture-annotation-readiness.mjs';
import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';

function parseArgs(argv) {
  const options = { adb: 'adb', appId: 'com.foliole.android', serial: '' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--adb' && value) options.adb = value;
    else if (key === '--serial' && value) options.serial = value;
    else if (key === '--app-id' && value) options.appId = value;
    else throw new Error('Capture annotation readiness accepts only fixed adb, serial, and app-id options');
  }
  return options;
}

export async function runCaptureAnnotationReadiness(options) {
  const snapshot = await collectAndroidDeviceSnapshot({
    ...options, databaseInspector: inspectCaptureAnnotationWorkspace, includeEvents: false,
    tables: ['nodes', 'node_order', 'content_blobs', 'companion_meta']
  });
  return captureAnnotationReadiness(snapshot);
}

async function main() {
  const readiness = await runCaptureAnnotationReadiness(parseArgs(process.argv.slice(2)));
  console.log(`[android-data] capture-annotation-readiness=${JSON.stringify(readiness)}`);
  if (readiness.resultStatus !== 'ready') process.exitCode = 77;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
