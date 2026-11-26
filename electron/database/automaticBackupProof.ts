import { createHash } from 'node:crypto';
import { closeSync, createReadStream, fstatSync, openSync, readSync, promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseConnection } from './connection.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';

/**
 * Proof, held only in this process, that the library still holds exactly the content of a verified ordinary
 * restore point. It lets a later automatic backup cycle skip copying the whole library only to find it unchanged.
 * Any doubt drops it: another connection, a different library file or SQLite sidecar state, a write by any
 * connection or process, or restore point bytes that differ. A restart starts without proofs.
 */
interface UnchangedProof {
  fingerprint: string;
  restorePointPath: string;
  restorePointSha256: string;
}

export interface RestorePointIdentity {
  filePath: string;
  sha256: string;
  statKey: string;
}

const proofs = new Map<string, UnchangedProof>();
const connectionIds = new WeakMap<DatabaseConnection, number>();
let nextConnectionId = 0;

function fileSignal(filePath: string, headerBytes: number) {
  let descriptor: number;
  try {
    descriptor = openSync(filePath, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    const header = Buffer.alloc(headerBytes);
    const read = headerBytes ? readSync(descriptor, header, 0, headerBytes, 0) : 0;
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, header.subarray(0, read).toString('hex')].join(':');
  } finally {
    closeSync(descriptor);
  }
}

/** This connection's own writes: SQLite's data version ignores them, and file times may be too coarse to show them. */
export function readOwnWriteCounter(connection: DatabaseConnection) {
  const rows = connection.sqlite.prepare('SELECT total_changes()').pluck().get();
  return `${rows}:${connection.sqlite.pragma('main.schema_version', { simple: true })}`;
}

/**
 * Changes whenever a commit could have reached the main library file: the own write counter catches this
 * connection, SQLite's data version catches other connections, and the file, WAL and journal stats and headers
 * catch checkpoints and swaps.
 */
export function readLibraryChangeFingerprint(connection: DatabaseConnection) {
  let id = connectionIds.get(connection);
  if (id === undefined) connectionIds.set(connection, id = ++nextConnectionId);
  const dataVersion = connection.sqlite.pragma('main.data_version', { simple: true });
  return [id, readOwnWriteCounter(connection), dataVersion, fileSignal(connection.dbPath, 100),
    fileSignal(`${connection.dbPath}-wal`, 32), fileSignal(`${connection.dbPath}-journal`, 0)].join('|');
}

/** Snapshot of the library, carrying its fingerprint only when no commit could have landed during the copy. */
export async function backupLibraryWithFingerprint(connection: DatabaseConnection, destinationPath: string) {
  const before = readLibraryChangeFingerprint(connection);
  const result = await backupSqliteDatabase({
    destinationPath, sourceDatabase: connection.sqlite, sourcePath: connection.dbPath
  });
  return { ...result, sourceFingerprint: before === readLibraryChangeFingerprint(connection) ? before : null };
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function restorePointStatKey(filePath: string) {
  const stat = await fs.stat(filePath, { bigint: true });
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}

/** Hash of a restore point whose bytes did not change while it was read. */
export async function readRestorePointIdentity(filePath: string, expectedStatKey?: string): Promise<RestorePointIdentity | null> {
  try {
    const before = await restorePointStatKey(filePath);
    if (expectedStatKey !== undefined && before !== expectedStatKey) return null;
    const sha256 = await sha256File(filePath);
    return before === await restorePointStatKey(filePath) ? { filePath: path.resolve(filePath), sha256, statKey: before } : null;
  } catch {
    return null;
  }
}

export async function libraryProvenUnchanged(
  libraryPath: string,
  restorePointPath: string | null,
  readFingerprint: (() => Promise<string | null>) | undefined
) {
  const proof = proofs.get(libraryPath);
  if (!proof || !readFingerprint || !restorePointPath || path.resolve(restorePointPath) !== proof.restorePointPath) {
    return false;
  }
  if (await readFingerprint() !== proof.fingerprint) return false;
  return (await readRestorePointIdentity(restorePointPath))?.sha256 === proof.restorePointSha256;
}

export function rememberLibraryProof(libraryPath: string, fingerprint: string | null | undefined,
  restorePoint: RestorePointIdentity | null) {
  if (!fingerprint || !restorePoint) return;
  proofs.set(libraryPath, { fingerprint, restorePointPath: restorePoint.filePath, restorePointSha256: restorePoint.sha256 });
}

export function forgetLibraryProof(libraryPath: string) {
  proofs.delete(libraryPath);
}
