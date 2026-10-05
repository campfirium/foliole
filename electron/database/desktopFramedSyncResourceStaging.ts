import {
  failFramedSync,
  framedSyncBigInt,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncNodeResources } from '../../lib/core/sync/framedSyncNodeResources.js';
import type { BlobChunkInput } from '../../lib/core/sync/framedSyncStagingContract.js';

type ResourceChunkInput = BlobChunkInput & Readonly<{ chunkSha256: Uint8Array }>;

function descriptorFrom(row: DbRow, sha256: Uint8Array) {
  return {
    byteLength: framedSyncBigInt(row, 'byte_length'),
    required: Number(row.required) === 1,
    role: Number(row.role),
    sha256
  };
}

function validateChunk(descriptor: ReturnType<typeof descriptorFrom>, input: ResourceChunkInput) {
  const limit = BigInt(FRAMED_SYNC_LIMITS.blobChunkBytes);
  const length = BigInt(input.data.byteLength);
  if (descriptor.role === 1 || length < 1n || length > limit || input.offset % limit !== 0n ||
      input.offset + length > descriptor.byteLength ||
      length !== (descriptor.byteLength - input.offset < limit
        ? descriptor.byteLength - input.offset : limit)) {
    failFramedSync('resource_blob_chunk_invalid');
  }
}

export function createDesktopFramedSyncResourceStaging(db: DbPort) {
  return {
    stageResourceBlobChunk: (input: ResourceChunkInput) => stageResourceBlobChunk(db, input),
    verifyAndMarkResourceBlobAvailable: (input: ResourceAvailableInput) =>
      verifyAndMarkResourceBlobAvailable(db, input)
  };
}

type ResourceAvailableInput = Readonly<{
  attemptId: Uint8Array; sha256: Uint8Array; storageKey: string; transferId: Uint8Array;
}>;

async function stageResourceBlobChunk(db: DbPort, input: ResourceChunkInput) {
  return db.transaction(async (tx) => {
    const descriptor = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_blob_offers
      WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?`,
    [input.transferId, input.attemptId, input.sha256]);
    const attempt = await readFramedSyncRow(tx, `SELECT state FROM framed_sync_inbound_attempts
      WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
    if (!descriptor || !attempt || framedSyncText(attempt, 'state') !== 'receiving') {
      failFramedSync('resource_blob_chunk_not_admitted');
    }
    validateChunk(descriptorFrom(descriptor, input.sha256), input);
    const overlap = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_resource_blob_chunks
      WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?
        AND byte_offset < ? AND byte_offset + byte_length > ?`,
    [input.transferId, input.attemptId, input.sha256,
      input.offset + BigInt(input.data.byteLength), input.offset]);
    if (overlap) return framedSyncBigInt(overlap, 'byte_offset') === input.offset &&
      framedSyncBigInt(overlap, 'byte_length') === BigInt(input.data.byteLength) &&
      sameFramedSyncBytes(framedSyncBytes(overlap, 'chunk_sha256'), input.chunkSha256)
      ? 'identical' as const : failFramedSync('resource_blob_chunk_overlap');
    await tx.run('INSERT INTO framed_sync_resource_blob_chunks VALUES (?, ?, ?, ?, ?, ?)',
      [input.transferId, input.attemptId, input.sha256, input.offset,
        input.data.byteLength, input.chunkSha256]);
    return 'created' as const;
  });
}

async function verifyAndMarkResourceBlobAvailable(db: DbPort, input: ResourceAvailableInput) {
  return db.transaction(async (tx) => {
        const descriptor = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_blob_offers
          WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?`,
        [input.transferId, input.attemptId, input.sha256]);
        if (!descriptor) failFramedSync('blob_offer_required');
        const expected = descriptorFrom(descriptor, input.sha256);
        const resource = readFramedSyncNodeResources(JSON.stringify([{
          original_name: null,
          role: expected.role === 2 ? 'image' : 'reference',
          storage_key: input.storageKey
        }]))[0];
        if (!resource || resource.contentHash !== Buffer.from(input.sha256).toString('hex') ||
            resource.role !== expected.role) failFramedSync('resource_blob_storage_key_invalid');
        await assertCompleteChunks(tx, input, expected.byteLength);
        const available = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_available_resources WHERE sha256 = ?', [input.sha256]);
        if (available && (framedSyncBigInt(available, 'byte_length') !== expected.byteLength ||
            framedSyncText(available, 'storage_key') !== input.storageKey)) {
          failFramedSync('resource_blob_available_identity_conflict');
        }
        if (!available) await tx.run('INSERT INTO framed_sync_available_resources VALUES (?, ?, ?)',
          [input.sha256, expected.byteLength, input.storageKey]);
        await tx.run(`INSERT OR IGNORE INTO framed_sync_resource_pins
          VALUES (?, ?, ?, ?, ?, ?)`, [input.transferId, input.sha256, expected.byteLength,
          expected.role, expected.required ? 1 : 0, input.storageKey]);
        return available ? 'identical' as const : 'available' as const;
  });
}

async function assertCompleteChunks(tx: DbPort, input: Readonly<{
  attemptId: Uint8Array; sha256: Uint8Array; transferId: Uint8Array;
}>, byteLength: bigint) {
  const rows = await tx.query<DbRow>(`SELECT byte_offset, byte_length
    FROM framed_sync_resource_blob_chunks WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?
    ORDER BY byte_offset`, [input.transferId, input.attemptId, input.sha256]);
  let offset = 0n;
  for (const row of rows) {
    if (framedSyncBigInt(row, 'byte_offset') !== offset) failFramedSync('blob_coverage_incomplete');
    offset += framedSyncBigInt(row, 'byte_length');
  }
  if (offset !== byteLength) failFramedSync('blob_coverage_incomplete');
}
