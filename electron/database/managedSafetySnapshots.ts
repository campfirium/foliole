import { existsSync, promises as fs, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  compressSqliteFile,
  materializeCompressedSqliteBackup
} from './compressedSqliteBackup.js';
import type { SqliteDatabase } from './connection.js';
import { verifyDatabaseIntegrity } from './integrity.js';
import {
  buildInternalDatabaseSnapshotPath,
  createInternalDatabaseSnapshot,
  createInternalDatabaseSnapshotWithBackup,
  type InternalDatabaseSnapshotResult
} from './internalSnapshots.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const protectedPaths = new Set<string>();
const pendingSettlements = new Set<Promise<void>>();

interface SafetySnapshotOptions {
  destinationDirectory?: string;
  now?: Date;
  reason: 'pre-migration' | 'pre-restore';
  sourceDatabase: SqliteDatabase;
  sourcePath: string;
}

export interface ManagedSafetySnapshot {
  currentPath: string;
  release: () => void;
}

export async function createManagedSafetySnapshotWithBackup(
  options: SafetySnapshotOptions
): Promise<ManagedSafetySnapshot> {
  const normalizedOptions = withAvailableSnapshotTimestamp(options);
  const protection = protectSnapshotPaths(normalizedOptions);
  try {
    const snapshot = await createInternalDatabaseSnapshotWithBackup(normalizedOptions);
    protection.currentPath = await settleSnapshotCompression(snapshot);
    return protection;
  } catch (error) {
    protection.release();
    throw error;
  }
}

export function createManagedSafetySnapshotForMigration(options: SafetySnapshotOptions) {
  const normalizedOptions = withAvailableSnapshotTimestamp(options);
  const protection = protectSnapshotPaths(normalizedOptions);
  try {
    const snapshot = createInternalDatabaseSnapshot(normalizedOptions);
    assertSqliteSnapshotIntegrity(snapshot.destinationPath);
    return { protection, snapshot };
  } catch (error) {
    protection.release();
    throw error;
  }
}

export function settleManagedMigrationSnapshot(
  snapshot: InternalDatabaseSnapshotResult,
  protection: ManagedSafetySnapshot
) {
  const settlement = settleSnapshotCompression(snapshot)
    .then((currentPath) => { protection.currentPath = currentPath; })
    .finally(() => protection.release());
  pendingSettlements.add(settlement);
  void settlement.then(
    () => pendingSettlements.delete(settlement),
    () => pendingSettlements.delete(settlement)
  );
}

export async function waitForManagedSafetySnapshotSettlements() {
  await Promise.allSettled([...pendingSettlements]);
}

export function isManagedSafetySnapshotProtected(filePath: string) {
  return protectedPaths.has(path.resolve(filePath));
}

export async function assertManagedSafetySnapshotIntegrity(filePath: string) {
  const resolvedPath = path.resolve(filePath);
  const materialized = await materializeCompressedSqliteBackup(resolvedPath, path.dirname(resolvedPath));
  try {
    assertSqliteSnapshotIntegrity(materialized.databasePath);
  } finally {
    await materialized.cleanup();
  }
}

async function settleSnapshotCompression(snapshot: InternalDatabaseSnapshotResult) {
  const compressedPath = `${snapshot.destinationPath}.gz`;
  let compressedCreated = false;
  try {
    assertSqliteSnapshotIntegrity(snapshot.destinationPath);
    await compressSqliteFile(snapshot.destinationPath, compressedPath);
    compressedCreated = true;
    await assertManagedSafetySnapshotIntegrity(compressedPath);
    await fs.rm(snapshot.destinationPath);
    return compressedPath;
  } catch (error) {
    if (compressedCreated) {
      await fs.rm(compressedPath, { force: true });
    }
    console.error('[backup] safety snapshot compression failed; keeping sqlite snapshot', {
      cause: error instanceof Error ? error.message : String(error),
      snapshotPath: snapshot.destinationPath
    });
    return snapshot.destinationPath;
  }
}

function protectSnapshotPaths(options: SafetySnapshotOptions): ManagedSafetySnapshot {
  const databasePath = buildInternalDatabaseSnapshotPath(options);
  const paths = [databasePath, `${databasePath}.gz`].map((filePath) => path.resolve(filePath));
  paths.forEach((filePath) => protectedPaths.add(filePath));
  let released = false;
  return {
    currentPath: databasePath,
    release: () => {
      if (released) return;
      released = true;
      paths.forEach((filePath) => protectedPaths.delete(filePath));
    }
  };
}

function withAvailableSnapshotTimestamp(options: SafetySnapshotOptions): SafetySnapshotOptions {
  const initialNow = options.now ?? new Date();
  for (let offset = 0; offset < 1000; offset += 1) {
    const now = new Date(initialNow.getTime() + offset);
    const databasePath = buildInternalDatabaseSnapshotPath({ ...options, now });
    if (!existsSync(databasePath) && !existsSync(`${databasePath}.gz`)) {
      return { ...options, now };
    }
  }
  throw new Error(`failed to allocate a unique ${options.reason} snapshot path`);
}

function assertSqliteSnapshotIntegrity(filePath: string) {
  const sqlite = new BetterSqlite3(filePath, { fileMustExist: true, readonly: true });
  try {
    verifyDatabaseIntegrity(sqlite);
  } finally {
    sqlite.close();
    for (const suffix of ['-journal', '-shm', '-wal']) {
      rmSync(`${filePath}${suffix}`, { force: true });
    }
  }
}
