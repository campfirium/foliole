import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from './desktopFramedSyncStaging.js';

export function availableBlobDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const db = createBetterSqliteDbPort(sqlite);
  const staging = createDesktopFramedSyncStaging(db);
  function insert(data: Uint8Array) {
    const hash = sha256(data);
    sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)').run(hash, data.length, data);
    return { sha256: hash, byteLength: BigInt(data.length) };
  }
  async function pin(descriptor: ReturnType<typeof insert>, seed: number, role = 1) {
    const transferId = new Uint8Array(32).fill(seed);
    await staging.admitInboundProposal({ transferId, contentId: descriptor.sha256, blobCount: 1n,
      factCount: 0n, totalBlobBytes: descriptor.byteLength,
      context: { groupId: 'group', protocolVersion: 22, senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
        receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' } });
    sqlite.prepare('INSERT INTO framed_sync_blob_pins VALUES (?, ?, ?, ?, ?)')
      .run(transferId, descriptor.sha256, descriptor.byteLength, role, 1);
  }
  return { sqlite, db, insert, pin };
}

export function observeAvailableReads(db: DbPort) {
  const sizes: number[] = [];
  const statements: string[] = [];
  const port: DbPort = { ...db,
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      statements.push(sql);
      const rows = await db.query<T>(sql, params);
      for (const row of rows) for (const value of Object.values(row)) {
        if (value instanceof Uint8Array) sizes.push(value.byteLength);
      }
      return rows;
    }
  };
  return { port, sizes, statements };
}
