import {
  framedSyncBytes,
  framedSyncText,
  readFramedSyncReceipt,
  sameFramedSyncBytes
} from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../../../../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewApply.js';
import { canonicalFactFromValidatedMessage } from '../../../../../../lib/core/sync/framedSyncWireFact.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';

import { decodeCompanionFramedSyncTransfer } from './companionFramedSyncDecode.js';

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
  resourceStorageKeys?: readonly string[];
}

function sqlString(value: string) {
  if (!value) throw new Error('framed_sync_staging_path_required');
  return `'${value.replaceAll("'", "''")}'`;
}

function sameText(row: DbRow, name: string, expected: string) {
  if (framedSyncText(row, name) !== expected) throw new Error('framed_sync_transfer_context_mismatch');
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
  const bodyRows = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required, available.data
    FROM ${tables.alias}.${tables.prefix}_blob_pins pin
    JOIN ${tables.alias}.${tables.prefix}_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.role = 1`, [input.transferId]);
  const resourceRows = await db.query<DbRow>(
    `SELECT pin.sha256, pin.byte_length, pin.role, pin.required, pin.storage_key
      FROM ${tables.alias}.${tables.prefix}_resource_pins pin
      JOIN ${tables.alias}.${tables.prefix}_available_resources available
        ON available.sha256 = pin.sha256 AND available.byte_length = pin.byte_length
          AND available.storage_key = pin.storage_key
      WHERE pin.transfer_id = ?`, [input.transferId]);
  return { bodyRows, contentId: framedSyncBytes(transfer, 'content_id'), facts, resourceRows };
}

function receiptIdentityMatches(left: TransferReceiptStage, right: Omit<TransferReceiptStage, 'appliedStateHash'>) {
  return sameFramedSyncBytes(left.transferId, right.transferId) &&
    sameFramedSyncBytes(left.contentId, right.contentId) &&
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
    const decoded = decodeCompanionFramedSyncTransfer({ bodyRows: staged.bodyRows,
      facts: staged.facts, resourceRows: staged.resourceRows,
      resourceStorageKeys: input.resourceStorageKeys ?? [] });
    const receiptIdentity = {
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
        if (!receiptIdentityMatches(stored, receiptIdentity)) throw new Error('receipt_identity_conflict');
        return stored;
      }
      await assertFramedSyncNodeParentDependencies(tx, decoded.nodes);
      for (const node of decoded.nodes) {
        await upsertTextBodyBlob(
          tx, node.body_text ?? '', node.snapshot.updated_at, node.snapshot.body_blob_hash!
        );
      }
      if (decoded.nodes.length) await applySyncNodesWithDbPort(
        tx, decoded.nodes, { enqueueSearchInvalidations: false }
      );
      await applyFramedSyncRelationReviewFactsWithDbPort(tx, decoded.relationReviewFacts);
      const current = await readFramedSyncInventoryEntry(
        tx, { globalId: decoded.globalId, objectType: 'node' }
      );
      if (!current) throw new Error('framed_sync_applied_state_missing');
      const receipt: TransferReceiptStage = {
        ...receiptIdentity,
        appliedStateHash: current.sharedStateHash
      };
      await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [receipt.transferId,
        receipt.contentId, receipt.receiverDeviceId, receipt.receiverLibraryEpoch, receipt.appliedStateHash]);
      return receipt;
    });
  } finally {
    await db.run(`DETACH DATABASE ${tables.alias}`);
  }
}
