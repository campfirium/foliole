/* global process */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { openReadonlySqliteDatabase } from './sqlite-readonly.mjs';

const execFileAsync = promisify(execFile);

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
  candidates.push(path.posix.join(
    '/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'
  ));
  return [...new Set(candidates)];
}

async function resolveSerial(options) {
  if (options.serial) return options.serial;
  const { stdout } = await runAdb({ ...options, serial: '' }, ['devices'], { encoding: 'utf8' });
  const line = stdout.split(/\r?\n/u).find((entry) => /\bdevice$/u.test(entry.trim()));
  return line ? line.trim().split(/\s+/u)[0] : '';
}

function parsePackageInfo(output) {
  const info = {};
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    for (const key of ['firstInstallTime', 'lastUpdateTime', 'initiatingPackageName', 'dataDir']) {
      if (trimmed.startsWith(`${key}=`)) info[key] = trimmed.slice(key.length + 1);
    }
  }
  return info;
}

async function collectPackageInfo(options) {
  try {
    const { stdout } = await runAdb(
      options, ['shell', 'dumpsys', 'package', options.appId], { encoding: 'utf8' }
    );
    const info = parsePackageInfo(stdout);
    return { installed: Boolean(info.dataDir || info.firstInstallTime), ...info };
  } catch (error) {
    return { error: error.message, installed: false };
  }
}

export async function pullDatabaseFile(options, remotePath, destination, executeAdb = runAdb) {
  try {
    await executeAdb(options, [
      'shell', 'run-as', options.appId, 'test', '-f', remotePath
    ]);
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
  const { stdout } = await executeAdb(options, [
    'exec-out', 'run-as', options.appId, 'cat', remotePath
  ], { encoding: 'buffer' });
  if (!stdout || stdout.length === 0) throw new Error(`Android database file is empty: ${remotePath}`);
  await writeFile(destination, stdout);
  return true;
}

async function pullDatabase(options, destination) {
  const remoteBase = 'databases/foliole-companionSQLite.db';
  if (!await pullDatabaseFile(options, remoteBase, destination)) return null;
  const sidecarPaths = [];
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${destination}${suffix}`;
    if (await pullDatabaseFile(options, `${remoteBase}${suffix}`, sidecarPath)) {
      sidecarPaths.push(sidecarPath);
    }
  }
  return sidecarPaths;
}

function countTable(database, table) {
  const exists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table);
  if (!exists) return null;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

async function inspectDatabase(filePath, sidecarPaths, tables, inspector) {
  const size = (await stat(filePath)).size;
  let database = null;
  try {
    database = await openReadonlySqliteDatabase(filePath);
    const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check;
    if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity ?? 'missing'}`);
    const counts = Object.fromEntries(tables.map((table) => [table, countTable(database, table)]));
    return { counts, exists: true, inspection: inspector?.(database), integrity, path: filePath,
      sidecarPaths, size };
  } catch (error) {
    return {
      counts: {}, error: error.message, exists: true, path: filePath, sidecarPaths, size, unreadable: true
    };
  } finally {
    database?.close();
  }
}

async function collectEvents(options) {
  try {
    const { stdout } = await runAdb(
      options, ['logcat', '-b', 'events', '-d', '-t', '300'], { encoding: 'utf8' }
    );
    return stdout.split(/\r?\n/u)
      .filter((line) => /installer_clear_app_data|am_kill|install/iu.test(line)).slice(-30);
  } catch (error) {
    return [`event log unavailable: ${error.message}`];
  }
}

export async function collectAndroidDeviceSnapshot(rawOptions) {
  let serial = '';
  try {
    serial = await resolveSerial(rawOptions);
  } catch (error) {
    return { adb: rawOptions.adb, appId: rawOptions.appId, error: `adb unavailable: ${error.message}`, serial: '' };
  }
  const options = { ...rawOptions, serial };
  if (!serial) return { adb: options.adb, appId: options.appId, error: 'no ready Android device', serial: '' };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-db-'));
  const dbPath = path.join(tempDir, 'foliole-companion.db');
  try {
    const [packageInfo, events] = await Promise.all([
      collectPackageInfo(options), rawOptions.includeEvents === false ? [] : collectEvents(options)
    ]);
    const sidecarPaths = await pullDatabase(options, dbPath);
    const database = sidecarPaths
      ? await inspectDatabase(dbPath, sidecarPaths, options.tables, rawOptions.databaseInspector)
      : { exists: false };
    return { adb: options.adb, appId: options.appId, database, events, packageInfo, serial };
  } finally {
    if (!rawOptions.keepPulledDatabase) await rm(tempDir, { recursive: true, force: true });
  }
}
