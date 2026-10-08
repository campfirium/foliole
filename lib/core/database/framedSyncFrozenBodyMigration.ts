import { hexToBytes, isBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../sync/dbPort.js';
import { stageFramedSyncFrozenBody, validateFramedSyncFrozenBody } from '../sync/framedSyncFrozenBody.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const NEXT = `SELECT lower(hex(ref.sha256)) AS hash, min(ref.byte_length) AS byte_length,
  max(ref.byte_length) AS max_length FROM framed_sync_outbound_blob_refs ref
  JOIN framed_sync_outbound_holds owner ON owner.transfer_id = ref.transfer_id
  WHERE ref.role IN (1, 5) AND lower(hex(ref.sha256)) > ?
  GROUP BY ref.sha256 ORDER BY hash LIMIT 1`;
const AVAILABLE = 'SELECT byte_length, data FROM framed_sync_available_blobs WHERE sha256 = ?';
const LEGACY = 'SELECT data FROM content_blob_data WHERE hash = ?';
type Source = { hash: string; byte_length: number; max_length: number };
type Bytes = { data: Uint8Array; byte_length?: number };

function descriptor(row: Source) {
  if (row.byte_length !== row.max_length) throw new Error('framed_sync_published_body_unavailable');
  return { sha256: hexToBytes(row.hash), byteLength: BigInt(row.byte_length), role: 1, required: true };
}

function dataFor(row: Source, source: Bytes | undefined) {
  if (!source || !isBytes(source.data) ||
      (source.byte_length !== undefined && source.byte_length !== row.byte_length)) {
    throw new Error('framed_sync_published_body_unavailable');
  }
  return validateFramedSyncFrozenBody(descriptor(row), source.data);
}

/** Normal schema transaction preserves pending publications before legacy text storage retires. */
export function migrateFramedSyncFrozenBodies(sqlite: DatabaseMigrationTarget) {
  let after = '';
  for (;;) {
    const row = sqlite.prepare(NEXT).all(after)[0] as Source | undefined;
    if (!row) return;
    after = row.hash;
    const blob = descriptor(row);
    const available = sqlite.prepare(AVAILABLE).all(blob.sha256)[0] as Bytes | undefined;
    const data = dataFor(row, available ?? sqlite.prepare(LEGACY).all(row.hash)[0] as Bytes | undefined);
    if (!available) sqlite.prepare('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)')
      .run(blob.sha256, row.byte_length, data);
  }
}

export async function migrateCompanionFramedSyncFrozenBodies(db: DbPort) {
  let after = '';
  for (;;) {
    const [row] = await db.query<Source>(NEXT, [after]);
    if (!row) return;
    after = row.hash;
    const blob = descriptor(row);
    const [available] = await db.query<Bytes>(AVAILABLE, [blob.sha256]);
    const [legacy] = available ? [] : await db.query<Bytes>(LEGACY, [row.hash]);
    await stageFramedSyncFrozenBody(db, blob, dataFor(row, available ?? legacy));
  }
}
