import { bytesToHex } from '@noble/hashes/utils.js';

import { BODY_CONTENT_CHUNK_BYTES } from '../../../../../../lib/core/database/bodyContentSchema.js';
import { framedSyncBytes, framedSyncText, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import { bodyIdentity } from '../../../../../../lib/core/sync/bodyContentVerification.js';
import { adoptVerifiedBody } from '../../../../../../lib/core/sync/bodyContentWrite.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { loadVerifiedBodyRef, verifyBodyContent } from '../../../../../../lib/core/sync/verifiedBody.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';

async function requireReadyBody(db: DbPort, input: CompanionFramedSyncApplyInput, descriptor: CanonicalBlob) {
  const tables = STAGING_TABLES[input.stagingKind];
  if (!tables || (descriptor.role !== 1 && descriptor.role !== 5)) throw new Error('framed_sync_body_descriptor_invalid');
  const [transfer] = await db.query<DbRow>(`SELECT state, sender_device_id, sender_library_epoch,
    receiver_device_id, receiver_library_epoch FROM ${tables.alias}.${tables.prefix}_transfers WHERE transfer_id = ?`,
  [input.transferId]);
  if (!transfer || framedSyncText(transfer, 'state') !== 'ready_to_apply') throw new Error('framed_sync_transfer_not_ready');
  for (const [field, expected] of [['sender_device_id', input.senderDeviceId], ['sender_library_epoch', input.senderLibraryEpoch],
    ['receiver_device_id', input.receiverDeviceId], ['receiver_library_epoch', input.receiverLibraryEpoch]]) {
    if (typeof field !== 'string' || framedSyncText(transfer, field) !== expected) throw new Error('framed_sync_transfer_context_mismatch');
  }
  const [pin] = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required,
    available.byte_length AS available_length, length(available.data) AS stored_length, typeof(available.data) AS stored_type
    FROM ${tables.alias}.${tables.prefix}_blob_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.sha256 = ?`, [input.transferId, descriptor.sha256]);
  if (!pin || !sameFramedSyncBytes(framedSyncBytes(pin, 'sha256'), descriptor.sha256) ||
      BigInt(String(pin.byte_length)) !== descriptor.byteLength || pin.role !== descriptor.role ||
      pin.required !== Number(descriptor.required) || BigInt(String(pin.available_length)) !== descriptor.byteLength ||
      BigInt(String(pin.stored_length)) !== descriptor.byteLength || pin.stored_type !== 'blob') throw new Error('framed_sync_body_pin_mismatch');
  return `${tables.alias}.${tables.prefix}_available_blobs`;
}

async function copyChunk(db: DbPort, table: string, hash: string, descriptor: CanonicalBlob, offset: number, size: number) {
  const [existing] = await db.query<{ matches: number }>(`SELECT data = (
    SELECT substr(data, ?, ?) FROM ${table} WHERE sha256 = ?) AS matches
    FROM content_body_chunks WHERE hash = ? AND byte_offset = ?`,
  [offset + 1, size, descriptor.sha256, hash, offset]);
  if (existing) {
    if (existing.matches !== 1) throw new Error('body_chunk_identity_conflict');
    return;
  }
  await db.run(`INSERT INTO content_body_chunks (hash, byte_offset, data)
    SELECT ?, ?, substr(data, ?, ?) FROM ${table} WHERE sha256 = ?`,
  [hash, offset, offset + 1, size, descriptor.sha256]);
}

/** Caller owns the attached staging lifetime and the enclosing business transaction until adoption commits. */
export async function adoptCompanionStagedBody(
  db: DbPort, input: CompanionFramedSyncApplyInput, descriptor: CanonicalBlob, now: string
) {
  const identity = bodyIdentity.parse({ hash: bytesToHex(descriptor.sha256), byteLength: Number(descriptor.byteLength) });
  const table = await requireReadyBody(db, input, descriptor);
  await db.run('INSERT OR IGNORE INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
    [identity.hash, identity.byteLength]);
  const [header] = await db.query<{ byte_length: number }>('SELECT byte_length FROM content_bodies WHERE hash = ?', [identity.hash]);
  if (header?.byte_length !== identity.byteLength) throw new Error('body_identity_conflict');
  for (let offset = 0; offset < identity.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    await copyChunk(db, table, identity.hash, descriptor, offset, Math.min(BODY_CONTENT_CHUNK_BYTES, identity.byteLength - offset));
  }
  const existing = await loadVerifiedBodyRef(db, identity.hash);
  const ref = existing ?? await verifyBodyContent(db, identity);
  await adoptVerifiedBody(db, ref, now);
  return ref;
}
