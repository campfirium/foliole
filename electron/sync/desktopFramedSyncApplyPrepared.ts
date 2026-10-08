import { recordFramedSyncPinnedResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { assertFramedSyncNodeParentDependencies } from '../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../database/desktopFramedSyncRelationReviewApply.js';

import { createDesktopFramedReceipt as createReceipt, recordDesktopFramedSourceProgress as recordSourceProgress } from './desktopFramedSyncApplyLifecycle.js';
import { commitDesktopFramedResourceInbound } from './desktopFramedSyncResourceApply.js';
import { applyDesktopFramedSyncInboundStates, type DesktopFramedSyncApplyInbound } from './desktopFramedSyncStateInbound.js';

export async function applyPreparedDesktopFramedSyncInbound(input: {
  db: DbPort;
  transfers: readonly DesktopFramedSyncApplyInbound[];
}) {
  const applied = await input.db.transaction(async (tx) => {
    if (!input.transfers.length) await assertSyncGroupLocalPublicationAllowed(tx);
    for (const transfer of input.transfers) {
      if (!await assertSyncGroupOverwriteInbound(tx, transfer.context)) await assertSyncGroupLocalPublicationAllowed(tx);
    }
    const databaseTransfers = input.transfers.filter((transfer) => !('resourceFacts' in transfer && transfer.resourceFacts?.length));
    const records = databaseTransfers.flatMap((transfer) => transfer.records);
    await recordFramedSyncPinnedResourceAvailability(tx, databaseTransfers.map((transfer) => transfer.transferId));
    let generatedChanges = false;
    await assertFramedSyncNodeParentDependencies(tx, records);
    if (records.length) {
      const result = await applyConvergentSyncNodesWithDbPort(tx, records);
      generatedChanges = result.handledConflictCount > 0;
    }
    await applyDesktopFramedSyncRelationReviewFactsWithDbPort(
      tx, databaseTransfers.flatMap((transfer) => transfer.relationReviewFacts)
    );
    await applyDesktopFramedSyncInboundStates(tx, databaseTransfers);
    await recordSourceProgress(tx, databaseTransfers);
    const receipts = await Promise.all(input.transfers.map((transfer) =>
      'resourceFacts' in transfer && transfer.resourceFacts?.length
        ? commitDesktopFramedResourceInbound(tx, { ...transfer, facts: transfer.resourceFacts })
        : createReceipt(tx, transfer)));
    return { generatedChanges, receipts };
  });
  await Promise.all(input.transfers.map((transfer) =>
    transfer.staging.releasePins(transfer.transferId, 'business_reference_committed')));
  return applied;
}
