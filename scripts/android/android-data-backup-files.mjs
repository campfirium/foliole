import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function copyVerified(source, destination) {
  await copyFile(source, destination);
  const [sourceSha256, backupSha256] = await Promise.all([sha256(source), sha256(destination)]);
  if (sourceSha256 !== backupSha256) throw new Error(`Android backup copy differs: ${destination}`);
  return backupSha256;
}

export async function backupDatabase(options, snapshot) {
  const database = snapshot.database;
  if (!database?.exists) return { created: false, reason: 'database unavailable' };
  await mkdir(options.backupRoot, { recursive: true });
  const nodes = database.counts?.nodes ?? 'unknown';
  const baseName = `${timestamp()}_${safeName(snapshot.serial)}_${safeName(options.appId)}_nodes-${nodes}_bytes-${database.size}`;
  const dbBackupPath = path.join(options.backupRoot, `${baseName}.db`);
  const manifestPath = path.join(options.backupRoot, `${baseName}.json`);
  const fileDigests = { database: await copyVerified(database.path, dbBackupPath), sidecars: {} };
  const sidecarPaths = [];
  for (const sourcePath of database.sidecarPaths ?? []) {
    const suffix = sourcePath.slice(database.path.length);
    const destination = `${dbBackupPath}${suffix}`;
    fileDigests.sidecars[suffix] = await copyVerified(sourcePath, destination);
    sidecarPaths.push(destination);
  }
  let attachmentArchivePath = null;
  if (snapshot.attachments?.path) {
    attachmentArchivePath = path.join(options.backupRoot, `${baseName}.attachments.tar`);
    fileDigests.attachments = await copyVerified(snapshot.attachments.path, attachmentArchivePath);
    if (fileDigests.attachments !== snapshot.attachments.sha256) {
      throw new Error('Android attachment backup differs from the protected archive.');
    }
  }
  const backup = { attachmentArchivePath, created: true, databasePath: dbBackupPath,
    fileDigests, manifestPath, sidecarPaths, validated: true };
  await writeManifest(manifestPath, { backup, snapshot });
  return backup;
}
