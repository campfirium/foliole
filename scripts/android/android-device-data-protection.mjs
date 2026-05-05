/* global console, process */

import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

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
  candidates.push(path.join('/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
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
  const database = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const counts = Object.fromEntries(tables.map((table) => [table, countTable(database, table)]));
    return { counts, exists: true, path: filePath, size };
  } finally {
    database.close();
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

function safeName(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
}

async function writeManifest(filePath, payload) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function backupDatabase(options, snapshot) {
  const database = snapshot.database;
  if (!database?.exists) return { created: false, reason: 'database unavailable' };
  await mkdir(options.backupRoot, { recursive: true });
  const nodes = database.counts.nodes ?? 0;
  const baseName = `${timestamp()}_${safeName(snapshot.serial)}_${safeName(options.appId)}_nodes-${nodes}_bytes-${database.size}`;
  const dbBackupPath = path.join(options.backupRoot, `${baseName}.db`);
  const manifestPath = path.join(options.backupRoot, `${baseName}.json`);
  await copyFile(database.path, dbBackupPath);
  const backup = { created: true, databasePath: dbBackupPath, manifestPath };
  await writeManifest(manifestPath, { backup, snapshot });
  return backup;
}

function printSummary(label, snapshot) {
  const counts = snapshot.database?.counts ?? {};
  const clearDataEvents = (snapshot.events ?? []).filter((event) => /installer_clear_app_data/i.test(event));
  console.log(`[android-data] ${label}: serial=${snapshot.serial || 'none'} installed=${snapshot.packageInfo?.installed ?? false}`);
  console.log(`[android-data] database=${snapshot.database?.exists ? 'present' : 'missing'} nodes=${counts.nodes ?? 'n/a'} node_order=${counts.node_order ?? 'n/a'} content_blobs=${counts.content_blobs ?? 'n/a'}`);
  if (counts.nodes === 0 && clearDataEvents.length > 0) {
    console.log('[android-data] warning: current Android database is empty and recent installer clear-data evidence was found');
  }
  for (const event of clearDataEvents) {
    console.log(`[android-data] clear-data evidence: ${event}`);
  }
}

async function runBackup(options) {
  const snapshot = await collectSnapshot({ ...options, keepPulledDatabase: true });
  try {
    const backup = await backupDatabase(options, snapshot);
    await writeManifest(options.manifest, { backup, snapshot });
    printSummary('before install', snapshot);
    if (!backup.created) console.log(`[android-data] warning: preinstall backup not created (${backup.reason})`);
    else console.log(`[android-data] backup: ${backup.databasePath}`);
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
  const after = await collectSnapshot(options);
  printSummary('after install', after);
  const beforeInstallTime = before.snapshot?.packageInfo?.firstInstallTime;
  const afterInstallTime = after.packageInfo?.firstInstallTime;
  if (beforeInstallTime && afterInstallTime && beforeInstallTime !== afterInstallTime) {
    console.log(`[android-data] warning: firstInstallTime changed from ${beforeInstallTime} to ${afterInstallTime}`);
  }
  if (isDataCleared(before, after)) {
    console.error('[android-data] data protection failure: Android database had nodes before install and is empty after install');
    if (after.events?.some((event) => /installer_clear_app_data/i.test(event))) {
      console.error('[android-data] cause evidence: installer_clear_app_data was present in recent event log');
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
