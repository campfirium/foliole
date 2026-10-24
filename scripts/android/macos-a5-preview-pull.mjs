/* global console */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SIDECARS = ['-wal', '-shm'];

export function companionPreviewDeviceRoot(repoRoot) {
  return path.join(repoRoot, '.cache', 'companion-preview', 'device');
}

export function companionPreviewDeviceDatabase(repoRoot) {
  return path.join(companionPreviewDeviceRoot(repoRoot), 'foliole-companionSQLite.db');
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

// The archive holds `files/attachments/<storage key>`, the layout the phone resolves attachments from.
export function installCompanionPreviewAttachments(archivePath, root) {
  rmSync(path.join(root, 'files'), { force: true, recursive: true });
  if (!archivePath) return null;
  execFileSync('tar', ['-xf', archivePath, '-C', root], { stdio: 'ignore' });
  return path.join(root, 'files', 'attachments');
}

async function pullDeviceLibrary({ adb, appId, serial }) {
  const { collectAndroidDeviceSnapshot } = await import('./android-device-snapshot.mjs');
  const snapshot = await collectAndroidDeviceSnapshot({ adb, appId, serial, tables: [],
    includeAttachments: true, includeEvents: false, keepPulledDatabase: true });
  if (snapshot.error || !snapshot.database?.path || snapshot.database.integrity !== 'ok') {
    throw new Error(`Android library pull failed: ${snapshot.error ?? snapshot.database?.error ?? 'unreadable'}`);
  }
  return { attachmentArchivePath: snapshot.attachments?.path ?? null, databasePath: snapshot.database.path };
}

/** Makes one standalone preview copy of the phone library and its attachments; nothing stays linked. */
export async function pullCompanionPreviewDatabase({ adb, appId, repoRoot, serial, pull = pullDeviceLibrary }) {
  const { attachmentArchivePath, databasePath } = await pull({ adb, appId, serial });
  try {
    const database = installCompanionPreviewCopy(databasePath, companionPreviewDeviceDatabase(repoRoot));
    const attachments = installCompanionPreviewAttachments(attachmentArchivePath, companionPreviewDeviceRoot(repoRoot));
    return { attachments, database };
  } finally {
    rmSync(path.dirname(databasePath), { force: true, recursive: true });
  }
}

export async function runMacosA5PreviewPull({ assertFixed, env, paths, serial }) {
  assertFixed();
  const { macosA5AppId } = await import('./macos-a5-app-identity.mjs');
  const { attachments, database } = await pullCompanionPreviewDatabase({ adb: paths.adb, appId: macosA5AppId(env),
    repoRoot: paths.sourceRepoRoot, serial });
  console.log(`[macos-a5-dev] preview-database=${database} preview-attachments=${attachments ?? 'none'}`);
}
