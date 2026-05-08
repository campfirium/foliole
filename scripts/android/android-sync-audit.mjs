#!/usr/bin/env node
/* global console, process */

import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSerial, runAdb } from './android-adb-command.mjs';
import { auditDatabases, formatAuditReport } from './android-sync-audit-core.mjs';

const DEFAULT_APP_ID = 'com.foliole.android';
const DEFAULT_DESKTOP_DB = '/mnt/d/X/U/Foliole/Data/foliole.db';
const DATABASE_CANDIDATES = ['databases/foliole-companionSQLite.db', 'databases/foliole-companion.db'];

function parseArgs(argv) {
  const options = {
    adb: process.env.ANDROID_ADB || 'adb',
    androidDb: '',
    appId: DEFAULT_APP_ID,
    desktopDb: process.env.FOLIOLE_DESKTOP_DB || DEFAULT_DESKTOP_DB,
    keep: false,
    serial: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--adb' && value) options.adb = value;
    if (key === '--android-db' && value) options.androidDb = value;
    if (key === '--app-id' && value) options.appId = value;
    if (key === '--desktop-db' && value) options.desktopDb = value;
    if (key === '--keep') options.keep = true;
    if (key === '--serial' && value) options.serial = value;
    if (key.startsWith('--') && key !== '--keep' && value) index += 1;
  }
  return options;
}

async function copySqliteSnapshot(sourcePath, outputDir, outputName) {
  const outputPath = path.join(outputDir, outputName);
  await copyFile(sourcePath, outputPath);
  const sidecars = [];
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${sourcePath}${suffix}`)) {
      await copyFile(`${sourcePath}${suffix}`, `${outputPath}${suffix}`);
      sidecars.push(suffix);
    }
  }
  return { outputPath, sidecars, sourcePath };
}

async function readDeviceFile(options, devicePath) {
  const { stdout } = await runAdb(
    options,
    ['exec-out', 'run-as', options.appId, 'cat', devicePath],
    { encoding: 'buffer' }
  );
  return stdout;
}

async function pullAndroidDatabase(options, outputDir) {
  if (options.androidDb) {
    return copySqliteSnapshot(options.androidDb, outputDir, path.basename(options.androidDb));
  }
  const serial = await resolveSerial(options);
  const resolved = { ...options, serial };
  let lastError = null;
  for (const devicePath of DATABASE_CANDIDATES) {
    try {
      const outputPath = path.join(outputDir, path.basename(devicePath));
      const database = await readDeviceFile(resolved, devicePath);
      assertSqliteDatabase(database, devicePath);
      await writeFile(outputPath, database);
      const sidecars = await pullAndroidSidecars(resolved, devicePath, outputPath);
      return { devicePath, outputPath, serial, sidecars };
    } catch (error) {
      lastError = error;
      // Try the next historical database file name.
    }
  }
  throw new Error(`No Android companion database was readable with run-as.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

function assertSqliteDatabase(buffer, devicePath) {
  if (buffer.subarray(0, 16).toString('utf8') === 'SQLite format 3\0') return;
  const preview = buffer.subarray(0, 80).toString('utf8').replace(/\s+/g, ' ').trim();
  throw new Error(`${devicePath} is not a SQLite database${preview ? ` (${preview})` : ''}`);
}

async function pullAndroidSidecars(options, devicePath, outputPath) {
  const sidecars = [];
  for (const suffix of ['-wal', '-shm']) {
    try {
      await writeFile(`${outputPath}${suffix}`, await readDeviceFile(options, `${devicePath}${suffix}`));
      sidecars.push(suffix);
    } catch {
      // Sidecar files are optional for quiet databases.
    }
  }
  return sidecars;
}

async function runAudit(options) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-sync-audit-'));
  try {
    await mkdir(tempDir, { recursive: true });
    const desktop = await copySqliteSnapshot(options.desktopDb, tempDir, 'desktop.db');
    const android = await pullAndroidDatabase(options, tempDir);
    const report = auditDatabases(desktop.outputPath, android.outputPath, { serial: android.serial });
    return { report, tempDir: options.keep ? tempDir : null };
  } finally {
    if (!options.keep) await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runAudit(parseArgs(process.argv.slice(2)))
    .then(({ report, tempDir }) => {
      console.log(formatAuditReport(report));
      if (tempDir) console.log(`\nkept snapshots: ${tempDir}`);
    })
    .catch((error) => {
      console.error(`[android-sync-audit] FAILED ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

export { parseArgs, runAudit };
