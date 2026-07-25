/* global console, process */

import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { backupDatabase, writeManifest } from './android-data-backup-files.mjs';
import { assertReadableDatabase } from './android-data-protection-validation.mjs';
import { classifyInstallerClearAppDataEvents } from './android-install-events.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_TABLES = ['nodes', 'node_order', 'content_blobs', 'sync_object_state', 'workspace_meta', 'companion_meta'];

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

async function runAdb(options, args, execOptions = {}) {
  const adbArgs = options.serial ? ['-s', options.serial, ...args] : args;
  const candidates = adbCandidates(options.adb);
  let lastError = null;
  for (const adbPath of candidates) {
    try {
      return await execFileAsync(adbPath, adbArgs, { maxBuffer: 1024 * 1024 * 80, ...execOptions });
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw lastError;
}

function adbCandidates(adbPath) {
  if (adbPath !== 'adb') return [adbPath];
  const candidates = ['adb', 'adb.exe'];
  for (const sdkRoot of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (sdkRoot) candidates.push(path.join(sdkRoot, 'platform-tools', 'adb'));
  }
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  }
  candidates.push(path.posix.join('/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  return [...new Set(candidates)];
}

async function resolveSerial(options) {
  if (options.serial) return options.serial;
  const { stdout } = await runAdb({ ...options, serial: '' }, ['devices'], { encoding: 'utf8' });
  const line = stdout.split(/\r?\n/).find((entry) => /\bdevice$/.test(entry.trim()));
  return line ? line.trim().split(/\s+/)[0] : '';
}

function parsePackageInfo(output) {
  const info = {};
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    for (const key of ['firstInstallTime', 'lastUpdateTime', 'initiatingPackageName', 'dataDir']) {
      if (trimmed.startsWith(`${key}=`)) info[key] = trimmed.slice(key.length + 1);
    }
  }
  return info;
}

async function collectPackageInfo(options) {
  try {
    const { stdout } = await runAdb(options, ['shell', 'dumpsys', 'package', options.appId], { encoding: 'utf8' });
    const info = parsePackageInfo(stdout);
    return { installed: Boolean(info.dataDir || info.firstInstallTime), ...info };
  } catch (error) {
    return { error: error.message, installed: false };
  }
}

async function pullDatabase(options, destination) {
  try {
    await runAdb(options, ['shell', 'run-as', options.appId, 'test', '-f', 'databases/foliole-companion.db']);
    const { stdout } = await runAdb(
      options,
      ['exec-out', 'run-as', options.appId, 'cat', 'databases/foliole-companion.db'],
      { encoding: 'buffer' }
    );
    if (!stdout || stdout.length === 0) return false;
    await writeFile(destination, stdout);
    return true;
  } catch {
    return false;
  }
}

function countTable(database, table) {
  const exists = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return null;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

async function inspectDatabase(filePath, tables) {
  const size = (await stat(filePath)).size;
  let database = null;
  try {
    database = new Database(filePath, { readonly: true, fileMustExist: true });
    const counts = Object.fromEntries(tables.map((table) => [table, countTable(database, table)]));
    return { counts, exists: true, path: filePath, size };
  } catch (error) {
    return { counts: {}, error: error.message, exists: true, path: filePath, size, unreadable: true };
  } finally {
    database?.close();
  }
}

async function collectEvents(options) {
  try {
    const { stdout } = await runAdb(options, ['logcat', '-b', 'events', '-d', '-t', '300'], { encoding: 'utf8' });
    return stdout
      .split(/\r?\n/)
      .filter((line) => /installer_clear_app_data|am_kill|install/i.test(line))
      .slice(-30);
  } catch (error) {
    return [`event log unavailable: ${error.message}`];
  }
}

export async function collectSnapshot(rawOptions) {
  let serial = '';
  try {
    serial = await resolveSerial(rawOptions);
  } catch (error) {
    return { adb: rawOptions.adb, appId: rawOptions.appId, error: `adb unavailable: ${error.message}`, serial: '' };
  }
  const options = { ...rawOptions, serial };
  if (!options.serial) return { adb: options.adb, appId: options.appId, error: 'no ready Android device', serial: '' };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-db-'));
  const dbPath = path.join(tempDir, 'foliole-companion.db');
  try {
    const [packageInfo, events] = await Promise.all([collectPackageInfo(options), collectEvents(options)]);
    const hasDatabase = await pullDatabase(options, dbPath);
    const database = hasDatabase ? await inspectDatabase(dbPath, options.tables) : { exists: false };
    return { adb: options.adb, appId: options.appId, database, events, packageInfo, serial: options.serial };
  } finally {
    if (!rawOptions.keepPulledDatabase) await rm(tempDir, { recursive: true, force: true });
  }
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
  const snapshot = await collectSnapshot({ ...options, keepPulledDatabase: true });
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
  const after = await collectSnapshot(options);
  assertReadableDatabase(after, 'after install');
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
  const snapshot = await collectSnapshot(options);
  printSummary('diagnose', snapshot);
  console.log(JSON.stringify(snapshot, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
