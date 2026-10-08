import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { withFramedExternalDocumentBody } from '../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { applyFramedSyncObjectStateRecord } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';

import type { PreparedDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';
import { loadDesktopFramedSyncReadyInbound } from './desktopFramedSyncReadyInbound.js';

type StagedStateInbound = Pick<PreparedDesktopFramedSyncInbound,
  'context' | 'globalId' | 'objectType' | 'manifestHash' | 'staging' | 'transferId'> & Readonly<{
    records: readonly [];
    relationReviewFacts: readonly [];
  }>;

export type DesktopFramedSyncApplyInbound = PreparedDesktopFramedSyncInbound | StagedStateInbound;

/** State-only transfers retain their verified durable source, rather than all payload strings. */
export function retainDesktopFramedSyncInboundForApply(
  transfer: PreparedDesktopFramedSyncInbound
): DesktopFramedSyncApplyInbound {
  if (transfer.records.length || transfer.relationReviewFacts.length || transfer.resourceFacts?.length) return transfer;
  return { context: transfer.context, globalId: transfer.globalId, objectType: transfer.objectType,
    manifestHash: transfer.manifestHash, staging: transfer.staging, transferId: transfer.transferId,
    records: [], relationReviewFacts: [] };
}

async function readStateInbound(db: DbPort, transfer: DesktopFramedSyncApplyInbound) {
  if ('stateRecords' in transfer) return transfer;
  const prepared = await loadDesktopFramedSyncReadyInbound({ db, staging: transfer.staging,
    published: { context: transfer.context, contentId: transfer.manifestHash,
      manifestHash: transfer.manifestHash, transferId: transfer.transferId } });
  if (!prepared || prepared.globalId !== transfer.globalId || prepared.objectType !== transfer.objectType ||
      prepared.records.length || prepared.relationReviewFacts.length) {
    throw new Error('framed_sync_ready_state_missing');
  }
  return prepared;
}

export async function applyDesktopFramedSyncInboundStates(
  db: DbPort, transfers: readonly DesktopFramedSyncApplyInbound[]
) {
  const hasSettings = transfers.some((transfer) => 'stateRecords' in transfer
    ? transfer.stateRecords.some((record) => record.object_type === 'setting') : transfer.objectType === 'setting');
  const hostName = hasSettings ? await readDesktopHostName(db) : null;
  for (const transfer of transfers) {
    const prepared = await readStateInbound(db, transfer);
    for (const record of prepared.stateRecords) await applyFramedSyncObjectStateRecord(db, withFramedExternalDocumentBody(record, prepared.externalBodies ?? []), {
      ...(hostName ? { hostName } : {}), onPayloadAppliedInTransaction: materializeDesktopSettingRecord
    });
  }
}
