import { randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import type { NativeBackupSearchNextResult } from '../../lib/platform/nativeBackupSearchContract.js';
import { findBackupSearchMatch, inspectBackupSearchSchema } from '../database/backupSearchQueries.js';
import { materializeCompressedSqliteBackup } from '../database/compressedSqliteBackup.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface BackupSearchWorkerInput {
  backups: Array<{ filePath: string; updatedAt: string }>;
  query: string;
  sessionDirectory: string;
}

interface ActiveBackup {
  databasePath: string;
  offset: number;
  schema: ReturnType<typeof inspectBackupSearchSchema>;
  sqlite: import('better-sqlite3').Database;
  updatedAt: string;
}

async function removeSqliteGroup(databasePath: string) {
  await Promise.all(['', '-journal', '-shm', '-wal'].map((suffix) =>
    fs.rm(`${databasePath}${suffix}`, { force: true })));
}

interface BackupMaterializationIo {
  copyFile: typeof fs.copyFile;
  materializeCompressed: typeof materializeCompressedSqliteBackup;
  rename: typeof fs.rename;
  stat: typeof fs.stat;
}

const defaultMaterializationIo: BackupMaterializationIo = {
  copyFile: fs.copyFile,
  materializeCompressed: materializeCompressedSqliteBackup,
  rename: fs.rename,
  stat: fs.stat
};

async function copyUncompressedBackup(
  sourcePath: string,
  sessionDirectory: string,
  io: BackupMaterializationIo
) {
  await io.stat(sourcePath);
  const temporaryPath = path.join(sessionDirectory, `.copy-${randomUUID()}.db`);
  const databasePath = path.join(sessionDirectory, `backup-${randomUUID()}.db`);
  try {
    await io.copyFile(sourcePath, temporaryPath, constants.COPYFILE_EXCL);
    await io.rename(temporaryPath, databasePath);
    return databasePath;
  } catch (error) {
    await removeSqliteGroup(temporaryPath);
    throw error;
  }
}

export async function materializeBackupForSearch(
  sourcePath: string,
  sessionDirectory: string,
  io: BackupMaterializationIo = defaultMaterializationIo
) {
  if (sourcePath.toLowerCase().endsWith('.db.gz')) {
    const materialized = await io.materializeCompressed(sourcePath, sessionDirectory);
    return materialized.databasePath;
  }
  return copyUncompressedBackup(sourcePath, sessionDirectory, io);
}

export class BackupSearchWorkerEngine {
  private active: ActiveBackup | null = null;
  private backupIndex = 0;
  private readonly returned = new Set<string>();
  private skippedBackupCount = 0;

  constructor(private readonly input: BackupSearchWorkerInput) {}

  private async closeActive() {
    const active = this.active;
    this.active = null;
    if (!active) return;
    try {
      active.sqlite.close();
    } finally {
      await removeSqliteGroup(active.databasePath);
    }
  }

  private async openNextBackup() {
    while (this.backupIndex < this.input.backups.length) {
      const entry = this.input.backups[this.backupIndex++];
      if (!entry) continue;
      let databasePath: string | null = null;
      try {
        databasePath = await materializeBackupForSearch(entry.filePath, this.input.sessionDirectory);
        const sqlite = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
        try {
          sqlite.pragma('query_only = ON');
          const schema = inspectBackupSearchSchema(sqlite);
          this.active = { databasePath, offset: 0, schema, sqlite, updatedAt: entry.updatedAt };
          return true;
        } catch (error) {
          sqlite.close();
          throw error;
        }
      } catch {
        this.skippedBackupCount += 1;
        if (databasePath) await removeSqliteGroup(databasePath);
      }
    }
    return false;
  }

  async next(): Promise<NativeBackupSearchNextResult> {
    while (this.active || await this.openNextBackup()) {
      const active = this.active;
      if (!active) continue;
      let match;
      try {
        match = findBackupSearchMatch({
          backupUpdatedAt: active.updatedAt,
          offset: active.offset,
          query: this.input.query,
          schema: active.schema,
          sqlite: active.sqlite
        });
      } catch {
        this.skippedBackupCount += 1;
        await this.closeActive();
        continue;
      }
      active.offset += 1;
      if (!match) {
        await this.closeActive();
        continue;
      }
      const duplicateKey = `${match.node_id}\0${match.content}`;
      if (this.returned.has(duplicateKey)) continue;
      this.returned.add(duplicateKey);
      return { match, skipped_backup_count: this.skippedBackupCount, status: 'match' };
    }
    return { skipped_backup_count: this.skippedBackupCount, status: 'complete' };
  }

  async dispose() {
    await this.closeActive();
  }
}

type WorkerRequest = { request_id: string; type: 'next' };
type WorkerResponse =
  | { ok: true; request_id: string; result: NativeBackupSearchNextResult }
  | { error: string; ok: false; request_id: string };

if (parentPort) {
  const engine = new BackupSearchWorkerEngine(workerData as BackupSearchWorkerInput);
  parentPort.on('message', async (request: WorkerRequest) => {
    if (request?.type !== 'next' || typeof request.request_id !== 'string') return;
    let response: WorkerResponse;
    try {
      response = { ok: true, request_id: request.request_id, result: await engine.next() };
    } catch (error) {
      response = { error: error instanceof Error ? error.message : String(error), ok: false, request_id: request.request_id };
    }
    parentPort?.postMessage(response);
  });
  parentPort.once('close', () => { void engine.dispose(); });
}
