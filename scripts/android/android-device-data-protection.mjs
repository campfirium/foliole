/* global console, process */

import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { backupDatabase, writeManifest } from './android-data-backup-files.mjs';
import { assertReadableDatabase } from './android-data-protection-validation.mjs';
import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { classifyInstallerClearAppDataEvents } from './android-install-events.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';

const DEFAULT_TABLES = ['nodes', 'node_order', 'content_blobs', 'sync_object_state', 'workspace_meta', 'companion_meta'];
const IDENTITY_FIELDS = [
  'activeSyncGroupMemberCount', 'deviceIdentityFingerprint', 'syncGroupId', 'syncGroupTimelineId'
];

function protectionFacts(snapshot) {
  const inspection = snapshot.database?.inspection ?? {};
  return {
    counts: snapshot.database?.counts ?? {},
    identity: Object.fromEntries(IDENTITY_FIELDS.map((key) => [key, inspection[key] ?? null])),
    integrity: snapshot.database?.integrity ?? null
  };
}

export function assertProtectionPreserved(before, after) {
  const beforeFacts = protectionFacts(before);
  const afterFacts = protectionFacts(after);
  if (JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts)) {
    throw new Error('Android data protection failure: database identity, group, timeline, or counts changed');
  }
}

function parseArgs(argv) {
  const options = {
    adb: process.env.ANDROID_ADB || 'adb',
    appId: 'com.foliole.android',
    backupRoot: path.resolve('.lab/internal/android-device-backups'),
    manifest: '',
    mode: 'diagnose',
    serial: '',
    tables: DEFAULT_TABLES
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--mode' && value) options.mode = value;
    if (key === '--adb' && value) options.adb = value;
    if (key === '--serial' && value) options.serial = value;
    if (key === '--app-id' && value) options.appId = value;
    if (key === '--backup-root' && value) options.backupRoot = path.resolve(value);
    if (key === '--manifest' && value) options.manifest = path.resolve(value);
    if (key.startsWith('--') && value) index += 1;
  }
  return options;
}

function printSummary(label, snapshot) {
  const counts = snapshot.database?.counts ?? {};
  const clearDataEvents = classifyInstallerClearAppDataEvents(snapshot.events ?? []);
  console.log(`[android-data] ${label}: serial=${snapshot.serial || 'none'} installed=${snapshot.packageInfo?.installed ?? false}`);
  console.log(`[android-data] database=${snapshot.database?.exists ? 'present' : 'missing'} nodes=${counts.nodes ?? 'n/a'} node_order=${counts.node_order ?? 'n/a'} content_blobs=${counts.content_blobs ?? 'n/a'}`);
  if (snapshot.database?.unreadable) {
    console.log(`[android-data] warning: database backup was created but sqlite inspection failed (${snapshot.database.error})`);
  }
  if (counts.nodes === 0 && clearDataEvents.potentialDataClear.length > 0) {
    console.log('[android-data] warning: current Android database is empty and recent installer clear-data evidence was found');
  }
  for (const event of clearDataEvents.potentialDataClear) {
    console.log(`[android-data] clear-data evidence: ${event.line}`);
  }
  for (const event of clearDataEvents.codeCacheOnly) {
    console.log(`[android-data] code-cache clear event: ${event.line}`);
  }
}

async function runBackup(options) {
  const snapshot = await collectAndroidDeviceSnapshot({
    ...options, databaseInspector: inspectPairSyncRecoveryWorkspace, keepPulledDatabase: true
  });
  try {
    assertReadableDatabase(snapshot, 'before install');
    const backup = await backupDatabase(options, snapshot);
    if (!backup.created) throw new Error(`Android data backup was not created: ${backup.reason}`);
    await writeManifest(options.manifest, { backup, snapshot });
    printSummary('before install', snapshot);
    console.log(`[android-data] backup: ${backup.databasePath}`);
  } finally {
    if (snapshot.database?.path) await rm(path.dirname(snapshot.database.path), { recursive: true, force: true });
  }
}

function isDataCleared(before, after) {
  const beforeNodes = before.snapshot?.database?.counts?.nodes ?? 0;
  const afterNodes = after.database?.counts?.nodes ?? 0;
  return beforeNodes > 0 && afterNodes === 0;
}

async function runCheck(options) {
  const before = JSON.parse(await readFile(options.manifest, 'utf8'));
  assertReadableDatabase(before.snapshot, 'before install');
  const after = await collectAndroidDeviceSnapshot({
    ...options, databaseInspector: inspectPairSyncRecoveryWorkspace
  });
  assertReadableDatabase(after, 'after install');
  assertProtectionPreserved(before.snapshot, after);
  printSummary('after install', after);
  const beforeInstallTime = before.snapshot?.packageInfo?.firstInstallTime;
  const afterInstallTime = after.packageInfo?.firstInstallTime;
  if (beforeInstallTime && afterInstallTime && beforeInstallTime !== afterInstallTime) {
    console.log(`[android-data] warning: firstInstallTime changed from ${beforeInstallTime} to ${afterInstallTime}`);
  }
  if (isDataCleared(before, after)) {
    console.error('[android-data] data protection failure: Android database had nodes before install and is empty after install');
    const clearDataEvents = classifyInstallerClearAppDataEvents(after.events ?? []);
    if (clearDataEvents.potentialDataClear.length > 0) {
      console.error('[android-data] cause evidence: destructive installer_clear_app_data was present in recent event log');
    }
    process.exit(2);
  }
  console.log('[android-data] status: OK');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'backup') return runBackup(options);
  if (options.mode === 'check') return runCheck(options);
  const snapshot = await collectAndroidDeviceSnapshot(options);
  printSummary('diagnose', snapshot);
  console.log(JSON.stringify(snapshot, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
