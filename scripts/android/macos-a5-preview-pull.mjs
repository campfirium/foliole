/* global console */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { pullAndroidDatabase } from './android-device-database-pull.mjs';

const require = createRequire(import.meta.url);
const SIDECARS = ['-wal', '-shm'];

export function companionPreviewDeviceDatabase(repoRoot) {
  return path.join(repoRoot, '.cache', 'companion-preview', 'device', 'foliole-companionSQLite.db');
}

/**
 * Copies a pulled device library into the browser preview cache and folds its WAL into one
 * file. Only the copy is opened for writing; the device and the pulled snapshot stay untouched.
 */
export function installCompanionPreviewCopy(pulledPath, target, Database = require('better-sqlite3')) {
  mkdirSync(path.dirname(target), { recursive: true });
  for (const suffix of ['', ...SIDECARS]) rmSync(`${target}${suffix}`, { force: true });
  copyFileSync(pulledPath, target);
  for (const suffix of SIDECARS) {
    if (existsSync(`${pulledPath}${suffix}`)) copyFileSync(`${pulledPath}${suffix}`, `${target}${suffix}`);
  }
  const database = new Database(target);
  try {
    const integrity = database.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Preview copy failed integrity check: ${integrity}`);
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
  return target;
}

export async function pullCompanionPreviewDatabase({ adb, appId, repoRoot, serial, pull = pullAndroidDatabase }) {
  const { databasePath } = await pull({ adb, appId, serial });
  try {
    return installCompanionPreviewCopy(databasePath, companionPreviewDeviceDatabase(repoRoot));
  } finally {
    rmSync(path.dirname(databasePath), { force: true, recursive: true });
  }
}

export async function runMacosA5PreviewPull({ assertFixed, env, paths, serial }) {
  assertFixed();
  const { macosA5AppId } = await import('./macos-a5-app-identity.mjs');
  const target = await pullCompanionPreviewDatabase({ adb: paths.adb, appId: macosA5AppId(env),
    repoRoot: paths.sourceRepoRoot, serial });
  console.log(`[macos-a5-dev] preview-database=${target}`);
}
