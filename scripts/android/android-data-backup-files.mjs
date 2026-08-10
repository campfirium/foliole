import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function safeName(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
}

export async function writeManifest(filePath, payload) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function backupDatabase(options, snapshot) {
  const database = snapshot.database;
  if (!database?.exists) return { created: false, reason: 'database unavailable' };
  await mkdir(options.backupRoot, { recursive: true });
  const nodes = database.counts?.nodes ?? 'unknown';
  const baseName = `${timestamp()}_${safeName(snapshot.serial)}_${safeName(options.appId)}_nodes-${nodes}_bytes-${database.size}`;
  const dbBackupPath = path.join(options.backupRoot, `${baseName}.db`);
  const manifestPath = path.join(options.backupRoot, `${baseName}.json`);
  await copyFile(database.path, dbBackupPath);
  const sidecarPaths = [];
  for (const sourcePath of database.sidecarPaths ?? []) {
    const suffix = sourcePath.slice(database.path.length);
    const destination = `${dbBackupPath}${suffix}`;
    await copyFile(sourcePath, destination);
    sidecarPaths.push(destination);
  }
  const backup = { created: true, databasePath: dbBackupPath, manifestPath, sidecarPaths };
  await writeManifest(manifestPath, { backup, snapshot });
  return backup;
}
