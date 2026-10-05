import { bytesToHex } from '@noble/hashes/utils.js';

import {
  framedSyncBytes,
  framedSyncText,
  readFramedSyncReceipt,
  sameFramedSyncBytes
} from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { restoreFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeRestore.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewApply.js';
import { canonicalFactFromValidatedMessage } from '../../../../../../lib/core/sync/framedSyncWireFact.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';

const STAGING_TABLES = {
  android: { alias: 'framed_android', prefix: 'framed_sync_android' },
  ios: { alias: 'framed_ios', prefix: 'framed_sync_ios' }
} as const;

export interface CompanionFramedSyncApplyInput {
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
  senderDeviceId: string;
  senderLibraryEpoch: string;
  stagingKind: keyof typeof STAGING_TABLES;
  stagingPath: string;
  transferId: Uint8Array;
}

function sqlString(value: string) {
  if (!value) throw new Error('framed_sync_staging_path_required');
  return `'${value.replaceAll("'", "''")}'`;
}

function sameText(row: DbRow, name: string, expected: string) {
  if (framedSyncText(row, name) !== expected) throw new Error('framed_sync_transfer_context_mismatch');
}

function blob(row: DbRow): CanonicalBlob {
  const byteLength = row.byte_length;
  const role = row.role;
  const required = row.required;
  if ((typeof byteLength !== 'number' && typeof byteLength !== 'string' && typeof byteLength !== 'bigint') ||
      typeof role !== 'number' || typeof required !== 'number') throw new Error('framed_sync_blob_row_invalid');
  return {
    byteLength: BigInt(byteLength),
    required: required === 1,
    role,
    sha256: framedSyncBytes(row, 'sha256')
  };
}

async function loadTransfer(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  const [transfer] = await db.query<DbRow>(`SELECT * FROM ${tables.alias}.${tables.prefix}_transfers
    WHERE transfer_id = ?`, [input.transferId]);
  if (!transfer || framedSyncText(transfer, 'state') !== 'ready_to_apply') {
    throw new Error('framed_sync_transfer_not_ready');
  }
  sameText(transfer, 'sender_device_id', input.senderDeviceId);
  sameText(transfer, 'sender_library_epoch', input.senderLibraryEpoch);
  sameText(transfer, 'receiver_device_id', input.receiverDeviceId);
  sameText(transfer, 'receiver_library_epoch', input.receiverLibraryEpoch);
  const attemptId = framedSyncBytes(transfer, 'active_attempt_id');
  const factFrames = await db.query<DbRow>(`SELECT frame_type, authenticated_plaintext
    FROM ${tables.alias}.${tables.prefix}_frames WHERE transfer_id = ? AND attempt_id = ?
      AND frame_type = 3 ORDER BY length(sequence), sequence`, [input.transferId, attemptId]);
  const facts = factFrames.map((row) => canonicalFactFromValidatedMessage(
    decodeAndValidateProtocolMessage(framedSyncBytes(row, 'authenticated_plaintext'), Number(row.frame_type))
  ));
  const blobRows = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required, available.data
    FROM ${tables.alias}.${tables.prefix}_blob_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ?`, [input.transferId]);
  return { blobRows, contentId: framedSyncBytes(transfer, 'content_id'), facts };
}

function assertSingleNode(
  facts: ReturnType<typeof canonicalFactFromValidatedMessage>[],
  blobRows: DbRow[]
) {
  const nodeFacts = facts.filter((fact) => fact.kind === 2);
  const relationReviewFacts = facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  if (nodeFacts.length !== 1 || nodeFacts.length + relationReviewFacts.length !== facts.length ||
      blobRows.length !== 1) {
    throw new Error('framed_sync_android_fact_set_unsupported');
  }
  const manifestBlob = blob(blobRows[0]!);
  const nodeFact = nodeFacts[0]!;
  const factBlob = nodeFact.blobs[0];
  if (!factBlob || bytesToHex(factBlob.sha256) !== bytesToHex(manifestBlob.sha256)) {
    throw new Error('framed_sync_android_blob_identity_mismatch');
  }
  return { node: restoreFramedSyncNodeRecord({
    bodyBlob: framedSyncBytes(blobRows[0]!, 'data'),
    fact: nodeFact,
    manifestBlob
  }), nodeFact, relationReviewFacts };
}

function receiptMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return sameFramedSyncBytes(left.transferId, right.transferId) &&
    sameFramedSyncBytes(left.contentId, right.contentId) &&
    sameFramedSyncBytes(left.appliedStateHash, right.appliedStateHash) &&
    left.receiverDeviceId === right.receiverDeviceId &&
    left.receiverLibraryEpoch === right.receiverLibraryEpoch;
}

export async function applyCompanionFramedSyncTransfer(
  db: DbPort,
  input: CompanionFramedSyncApplyInput
) {
  const tables = STAGING_TABLES[input.stagingKind];
  if (!tables) throw new Error('framed_sync_staging_kind_invalid');
  await db.run(`ATTACH DATABASE ${sqlString(input.stagingPath)} AS ${tables.alias}`);
  try {
    const staged = await loadTransfer(db, input);
    const decoded = assertSingleNode(staged.facts, staged.blobRows);
    const receipt: TransferReceiptStage = {
      appliedStateHash: decoded.nodeFact.sharedStateHash,
      contentId: staged.contentId,
      receiverDeviceId: input.receiverDeviceId,
      receiverLibraryEpoch: input.receiverLibraryEpoch,
      transferId: input.transferId
    };
    return await db.transaction(async (tx) => {
      const [existing] = await tx.query<DbRow>(
        'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [input.transferId]
      );
      if (existing) {
        const stored = readFramedSyncReceipt(existing);
        if (!receiptMatches(stored, receipt)) throw new Error('receipt_identity_conflict');
        return stored;
      }
      await upsertTextBodyBlob(
        tx,
        decoded.node.body_text ?? '',
        decoded.node.snapshot.updated_at,
        decoded.node.snapshot.body_blob_hash!
      );
      await applySyncNodesWithDbPort(tx, [decoded.node], { enqueueSearchInvalidations: false });
      await applyFramedSyncRelationReviewFactsWithDbPort(tx, decoded.relationReviewFacts);
      await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [receipt.transferId,
        receipt.contentId, receipt.receiverDeviceId, receipt.receiverLibraryEpoch, receipt.appliedStateHash]);
      return receipt;
    });
  } finally {
    await db.run(`DETACH DATABASE ${tables.alias}`);
  }
}
