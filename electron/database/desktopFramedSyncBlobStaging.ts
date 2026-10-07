import { createHash } from 'node:crypto';

import {
  failFramedSync,
  framedSyncBigInt,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncHeader,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncAppliedInbound } from '../../lib/core/sync/framedSyncAppliedInboundCleanup.js';
import {
  acceptBlobChunk,
  assertRequiredBlobsAvailable,
  selectMissingBlobs,
  validateBlobOffer,
  verifyCompleteBlob,
  type DurableBlobPin
} from '../../lib/core/sync/framedSyncBlobContract.js';
import { retireFramedSyncReadyPayloads } from '../../lib/core/sync/framedSyncReadyPayloadCleanup.js';
import type { BlobChunkInput, BlobOfferTransactionInput } from '../../lib/core/sync/framedSyncStagingContract.js';

function assertAvailableBlobMatches(row: DbRow, byteLength: bigint, data?: Uint8Array) {
  if (framedSyncBigInt(row, 'byte_length') !== byteLength ||
      (data && !sameFramedSyncBytes(framedSyncBytes(row, 'data'), data))) {
    failFramedSync('blob_available_identity_conflict');
  }
}

function assertBlobPinMatches(row: DbRow, descriptor: BlobOfferTransactionInput['blobs'][number]) {
  if (framedSyncBigInt(row, 'byte_length') !== descriptor.byteLength ||
      Number(row.role) !== descriptor.role || Number(row.required) !== Number(descriptor.required)) {
    failFramedSync('blob_pin_identity_conflict');
  }
}

async function pinAvailableBlob(tx: DbPort, transferId: Uint8Array,
  descriptor: BlobOfferTransactionInput['blobs'][number]) {
  const existing = await readFramedSyncRow(tx,
    'SELECT * FROM framed_sync_blob_pins WHERE transfer_id = ? AND sha256 = ?',
  [transferId, descriptor.sha256]);
  if (existing) {
    assertBlobPinMatches(existing, descriptor);
    return;
  }
  await tx.run('INSERT INTO framed_sync_blob_pins VALUES (?, ?, ?, ?, ?)',
    [transferId, descriptor.sha256, descriptor.byteLength, descriptor.role, descriptor.required ? 1 : 0]);
}

function createBlobTransferStaging(db: DbPort) {
  return {
    async commitBlobOfferAndMissingSet(input: BlobOfferTransactionInput) {
      return db.transaction(async (tx) => {
        const value = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.transferId]);
        if (!value?.header_json || !value.active_attempt_id || framedSyncText(value, 'state') !== 'header_declared') {
          failFramedSync('inbound_header_required');
        }
        const attemptId = framedSyncBytes(value, 'active_attempt_id');
        validateBlobOffer(readFramedSyncHeader(value).blobs, input.blobs);
        const pins: DurableBlobPin[] = [];
        for (const blob of input.blobs) {
          const available = await readFramedSyncRow(tx,
            'SELECT * FROM framed_sync_available_blobs WHERE sha256 = ?', [blob.sha256]);
          await tx.run('INSERT OR IGNORE INTO framed_sync_blob_offers VALUES (?, ?, ?, ?, ?, ?)',
            [input.transferId, attemptId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
          if (available) {
            assertAvailableBlobMatches(available, blob.byteLength);
            await pinAvailableBlob(tx, input.transferId, blob);
            pins.push({ ...blob, durable: true, transferId: input.transferId, verified: true });
          }
        }
        return selectMissingBlobs(input.transferId, input.blobs, pins);
      });
    },

    async writeBlobChunk(input: BlobChunkInput) {
      return db.transaction(async (tx) => {
        const descriptor = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_blob_offers
          WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?`,
        [input.transferId, input.attemptId, input.sha256]);
        const attempt = await readFramedSyncRow(tx, `SELECT state FROM framed_sync_inbound_attempts
          WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
        if (!descriptor || !attempt || framedSyncText(attempt, 'state') !== 'receiving') {
          failFramedSync('blob_chunk_not_admitted');
        }
        const rows = await tx.query<DbRow>(`SELECT byte_offset, data FROM framed_sync_blob_chunks
          WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?`,
        [input.transferId, input.attemptId, input.sha256]);
        const accepted = acceptBlobChunk({
          byteLength: framedSyncBigInt(descriptor, 'byte_length'), sha256: input.sha256
        }, rows.map((row) => ({
          data: framedSyncBytes(row, 'data'), offset: framedSyncBigInt(row, 'byte_offset')
        })), { data: input.data, offset: input.offset });
        if (accepted.result === 'created') await tx.run(
          'INSERT INTO framed_sync_blob_chunks VALUES (?, ?, ?, ?, ?)',
          [input.transferId, input.attemptId, input.sha256, input.offset, input.data]);
        return accepted.result;
      });
    }
  };
}

function createBlobAvailabilityStaging(db: DbPort) {
  return {
    async verifyAndMarkBlobAvailable(transferId: Uint8Array, attemptId: Uint8Array, sha256: Uint8Array) {
      return db.transaction(async (tx) => {
        const descriptor = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_blob_offers
          WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?`, [transferId, attemptId, sha256]);
        if (!descriptor) failFramedSync('blob_offer_required');
        const attempt = await readFramedSyncRow(tx, `SELECT state FROM framed_sync_inbound_attempts
          WHERE transfer_id = ? AND attempt_id = ?`, [transferId, attemptId]);
        if (!attempt || framedSyncText(attempt, 'state') !== 'receiving') {
          failFramedSync('blob_attempt_not_receiving');
        }
        const current = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_blob_pins WHERE transfer_id = ? AND sha256 = ?', [transferId, sha256]);
        if (current) {
          assertBlobPinMatches(current, {
            byteLength: framedSyncBigInt(descriptor, 'byte_length'),
            required: Number(descriptor.required) === 1,
            role: Number(descriptor.role),
            sha256
          });
          return 'identical' as const;
        }
        const rows = await tx.query<DbRow>(`SELECT byte_offset, data FROM framed_sync_blob_chunks
          WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? ORDER BY byte_offset`,
        [transferId, attemptId, sha256]);
        const chunks = rows.map((row) => ({
          data: framedSyncBytes(row, 'data'), offset: framedSyncBigInt(row, 'byte_offset')
        }));
        const data = Buffer.concat(chunks.map((chunk) => chunk.data));
        verifyCompleteBlob({ byteLength: framedSyncBigInt(descriptor, 'byte_length'), sha256 }, chunks,
          new Uint8Array(createHash('sha256').update(data).digest()));
        const available = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_available_blobs WHERE sha256 = ?', [sha256]);
        if (available) assertAvailableBlobMatches(available, BigInt(data.byteLength), data);
        else await tx.run('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)',
          [sha256, data.byteLength, data]);
        await pinAvailableBlob(tx, transferId, {
          byteLength: framedSyncBigInt(descriptor, 'byte_length'),
          required: Number(descriptor.required) === 1,
          role: Number(descriptor.role),
          sha256
        });
        return available ? 'identical' as const : 'available' as const;
      });
    }
  };
}

function createBlobPromotionStaging(db: DbPort) {
  return {
    async markReadyToApply(transferId: Uint8Array) {
      await db.transaction(async (tx) => {
        const value = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
        if (!value?.header_json || !value.active_attempt_id || !value.canonical_manifest ||
          framedSyncText(value, 'state') !== 'receiving') failFramedSync('inbound_transfer_not_receiving');
        const declaration = readFramedSyncHeader(value);
        const facts = await readFramedSyncRow(tx, `SELECT count(*) AS count FROM framed_sync_inbound_facts
          WHERE transfer_id = ? AND attempt_id = ?`, [transferId, framedSyncBytes(value, 'active_attempt_id')]);
        if (Number(facts?.count) !== declaration.facts.length) failFramedSync('inbound_facts_incomplete');
        const rows = await tx.query<DbRow>('SELECT * FROM framed_sync_blob_pins WHERE transfer_id = ?', [transferId]);
        const resourceRows = await tx.query<DbRow>(
          'SELECT * FROM framed_sync_resource_pins WHERE transfer_id = ?', [transferId]);
        const pins = [...rows, ...resourceRows].map((row) => ({ byteLength: framedSyncBigInt(row, 'byte_length'), durable: true as const,
          required: Number(row.required) === 1, role: Number(row.role), sha256: framedSyncBytes(row, 'sha256'),
          transferId, verified: true as const }));
        assertRequiredBlobsAvailable(transferId, declaration.blobs.filter((blob) => blob.required), pins);
        await tx.run(`UPDATE framed_sync_inbound_attempts SET state = 'promoted'
          WHERE transfer_id = ? AND attempt_id = ?`, [transferId, framedSyncBytes(value, 'active_attempt_id')]);
        await tx.run(`UPDATE framed_sync_inbound_transfers SET state = 'ready_to_apply' WHERE transfer_id = ?`,
          [transferId]);
        await retireFramedSyncReadyPayloads(tx, transferId);
      });
    },

    async releasePins(transferId: Uint8Array,
      reason: 'business_reference_committed' | 'termination_acknowledged') {
      await db.transaction(async (tx) => {
        if (reason === 'business_reference_committed') {
          const value = await readFramedSyncRow(tx,
            'SELECT state FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
          if (!value || framedSyncText(value, 'state') !== 'applied') {
            failFramedSync('applied_transfer_required_for_pin_release');
          }
        } else if (!await readFramedSyncRow(tx,
          'SELECT 1 AS present FROM framed_sync_termination_acks WHERE transfer_id = ?', [transferId])) {
          failFramedSync('termination_ack_required_for_pin_release');
        }
        await tx.run('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?', [transferId]);
        await tx.run('DELETE FROM framed_sync_resource_pins WHERE transfer_id = ?', [transferId]);
        if (reason === 'business_reference_committed') await retireFramedSyncAppliedInbound(tx, transferId);
      });
    }
  };
}

export function createDesktopFramedSyncBlobStaging(db: DbPort) {
  return {
    ...createBlobTransferStaging(db),
    ...createBlobAvailabilityStaging(db),
    ...createBlobPromotionStaging(db)
  };
}
