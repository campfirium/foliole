import type { DbPort } from '../sync/dbPort.js';
import { assertBlobDescriptor } from '../sync/framedSyncBlobContract.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { availableBlobRebuildStatements, availableBlobTables, type AvailableBlobScope } from './framedSyncAvailableBlobScope.js';
import { verifyAvailableBlobChunks } from './framedSyncAvailableBlobVerification.js';

type AvailableSourceRow = { rowid: number; sha256: Uint8Array; byte_length: number; size: number; stored_type: string };

/** Explicit upgrade candidate only. Caller owns the transaction; no production registration or fallback. */
export async function migrateFramedSyncAvailableBlobs(db: DbPort, scope: AvailableBlobScope) {
  const tables = availableBlobTables(scope);
  for (const sql of availableBlobRebuildStatements(scope)) await db.run(sql);
  let after: number | null = null;
  let migrated = 0;
  for (;;) {
    const rows: AvailableSourceRow[] = await db.query<AvailableSourceRow>(
      `SELECT rowid, sha256, byte_length, length(data) AS size, typeof(data) AS stored_type
        FROM ${tables.oldAvailable} WHERE (? IS NULL OR rowid > ?) ORDER BY rowid LIMIT 1`, [after, after]);
    const row: AvailableSourceRow | undefined = rows[0];
    if (!row) break;
    const descriptor = { sha256: row.sha256, byteLength: BigInt(row.byte_length) };
    assertBlobDescriptor(descriptor);
    if (row.stored_type !== 'blob' || row.size !== row.byte_length) throw new Error('blob_available_identity_conflict');
    for (let offset = 0; offset < row.byte_length; offset += BODY_CONTENT_CHUNK_BYTES) {
      const size = Math.min(BODY_CONTENT_CHUNK_BYTES, row.byte_length - offset);
      await db.run(`INSERT INTO ${tables.chunks} (sha256, byte_offset, data)
        SELECT sha256, ?, substr(data, ?, ?) FROM ${tables.oldAvailable} WHERE rowid = ?`,
      [offset, offset + 1, size, row.rowid]);
    }
    await verifyAvailableBlobChunks(db, scope, descriptor);
    after = row.rowid;
    migrated += 1;
  }
  await db.run(`DROP TABLE ${tables.oldPins}`);
  await db.run(`DROP TABLE ${tables.oldAvailable}`);
  return { migrated };
}
