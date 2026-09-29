import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

export interface SyncPackSourceViewIdentity {
  sourceViewId: string;
  sourceEpoch: string;
  frontierStateSeq: number;
}

/** The caller owns the source connection and the lifetime of this temporary view. */
export async function createSyncPackSourceView(source: Database.Database, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(outputPath), '.sync-view-'));
  const stagedPath = path.join(staging, 'source.db');
  try {
    await source.backup(stagedPath, { progress: () => 128 });
    const snapshot = new Database(stagedPath);
    try { stampSourceView(snapshot); } finally { snapshot.close(); }
    await fs.chmod(stagedPath, 0o600);
    // Linking publishes a complete file and refuses to replace an existing view.
    await fs.link(stagedPath, outputPath);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  return openSyncPackSourceView(outputPath);
}

export function openSyncPackSourceView(filePath: string, expected?: SyncPackSourceViewIdentity) {
  const sqlite = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const identity = readSourceViewIdentity(sqlite);
    if (expected && (identity.sourceViewId !== expected.sourceViewId ||
        identity.sourceEpoch !== expected.sourceEpoch ||
        identity.frontierStateSeq !== expected.frontierStateSeq)) {
      throw new Error('sync_pack_source_view_changed');
    }
    return { ...identity, filePath, driver: createBetterSqlite3Driver(sqlite),
      close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

function stampSourceView(sqlite: Database.Database) {
  sqlite.pragma('journal_mode = DELETE');
  sqlite.exec(`CREATE TABLE sync_pack_source_view (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    source_view_id TEXT NOT NULL, source_epoch TEXT NOT NULL,
    frontier_state_seq INTEGER NOT NULL CHECK (frontier_state_seq >= 0))`);
  sqlite.prepare(`INSERT INTO sync_pack_source_view
    SELECT 1, ?, source_epoch, high_water FROM sync_state_sequence WHERE singleton_id = 1`)
    .run(randomUUID());
  readSourceViewIdentity(sqlite);
}

function readSourceViewIdentity(sqlite: Database.Database): SyncPackSourceViewIdentity {
  const row = sqlite.prepare(`SELECT view.source_view_id AS sourceViewId,
    view.source_epoch AS sourceEpoch, view.frontier_state_seq AS frontierStateSeq
    FROM sync_pack_source_view view JOIN sync_state_sequence source ON source.singleton_id = 1
    WHERE view.singleton_id = 1 AND source.source_epoch = view.source_epoch
      AND source.high_water = view.frontier_state_seq`).get() as SyncPackSourceViewIdentity | undefined;
  if (!row || !row.sourceViewId || !row.sourceEpoch ||
      !Number.isSafeInteger(row.frontierStateSeq) || row.frontierStateSeq < 0) {
    throw new Error('sync_pack_source_view_invalid');
  }
  return row;
}
