import { framedSyncBytes, framedSyncText } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from '../../../../../../lib/core/sync/framedSyncWireFact.js';

import { applyPreparedCompanionFramedSyncTransfers } from './companionFramedSyncApplyPrepared.js';
import { decodeCompanionFramedSyncTransfer } from './companionFramedSyncDecode.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';

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
    WHERE pin.transfer_id = ? AND pin.role IN (1, 5)`, [input.transferId]);
  const resourceRows = await db.query<DbRow>(
    `SELECT pin.sha256, pin.byte_length, pin.role, pin.required, pin.storage_key
      FROM ${tables.alias}.${tables.prefix}_resource_pins pin
      JOIN ${tables.alias}.${tables.prefix}_available_resources available
        ON available.sha256 = pin.sha256 AND available.byte_length = pin.byte_length
          AND available.storage_key = pin.storage_key
      WHERE pin.transfer_id = ?`, [input.transferId]);
  return { bodyRows, contentId: framedSyncBytes(transfer, 'content_id'), facts, resourceRows };
}

export async function prepareCompanionFramedSyncTransfer(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  if (!tables) throw new Error('framed_sync_staging_kind_invalid');
  await db.run(`ATTACH DATABASE ${sqlString(input.stagingPath)} AS ${tables.alias}`);
  try {
    const staged = await loadTransfer(db, input);
    const decoded = decodeCompanionFramedSyncTransfer({ bodyRows: staged.bodyRows,
      facts: staged.facts, resourceRows: staged.resourceRows,
      resourceStorageKeys: input.resourceStorageKeys ?? [] });
    return { contentId: staged.contentId, decoded, input };
  } finally {
    await db.run(`DETACH DATABASE ${tables.alias}`);
  }
}

export async function applyCompanionFramedSyncTransfer(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const prepared = await prepareCompanionFramedSyncTransfer(db, input);
  const result = await applyPreparedCompanionFramedSyncTransfers(db, [prepared]);
  return result[0]!;
}
