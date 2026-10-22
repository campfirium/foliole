#!/usr/bin/env node
/* global console, process */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { macosA5AppId } from './macos-a5-app-identity.mjs';
import { inspectExistingSyncBaseline } from './macos-a5-existing-sync-inspection.mjs';
import { openReadonlySqliteDatabase } from './sqlite-readonly.mjs';

const run = promisify(execFile);

export async function inspectExistingSyncDevice({ adb, desktopDatabase }) {
  const args = ['-s', '87a33a4b'];
  const appId = macosA5AppId();
  const execute = extra => run(adb, [...args, ...extra], { encoding: 'utf8', timeout: 30_000 });
  const running = await execute(['shell', 'pidof', appId]).then(result => Boolean(result.stdout.trim()), error => {
    if (error.code === 1) return false;
    throw error;
  });
  const desktop = await openReadonlySqliteDatabase(desktopDatabase);
  try {
    await execute(['shell', 'am', 'force-stop', appId]);
    desktop.prepare('BEGIN').run();
    if (desktop.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') {
      throw new Error('existing_sync_desktop_integrity_failed');
    }
    const snapshot = await collectAndroidDeviceSnapshot({ adb, serial: '87a33a4b', appId,
      includeEvents: false, includeAttachments: false, tables: ['nodes'],
      databaseInspector: phone => inspectExistingSyncBaseline(phone, desktop) });
    if (!snapshot.database?.inspection || snapshot.database.integrity !== 'ok') {
      throw new Error(snapshot.database?.error ?? 'existing_sync_snapshot_unavailable');
    }
    return snapshot.database.inspection;
  } finally {
    desktop.close();
    if (running) await execute(['shell', 'am', 'start', '-n', `${appId}/com.foliole.android.MainActivity`]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , adb, desktopDatabase] = process.argv;
  if (!adb || !desktopDatabase || process.argv.length !== 4) throw new Error('existing_sync_arguments_invalid');
  const result = await inspectExistingSyncDevice({ adb, desktopDatabase });
  console.log(`[android-data] existing-sync-readiness=${JSON.stringify(result)}`);
  if (result.resultStatus !== 'ready') process.exitCode = 77;
}
