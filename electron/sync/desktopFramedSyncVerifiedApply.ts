import { recordFramedSyncPinnedResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../lib/core/sync/framedSyncResourceFact.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';

import { createDesktopFramedReceipt, recordDesktopFramedSourceProgress } from './desktopFramedSyncApplyLifecycle.js';
import { streamDesktopFramedSyncReadySourceFacts, type DesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';
import { commitDesktopFramedResourceSourceInbound } from './desktopFramedSyncResourceApply.js';

export type DesktopFramedVerifiedInbound = DesktopFramedSyncReadySource;

const resourceUnit = (transfer: DesktopFramedVerifiedInbound) =>
  transfer.entries[0]?.descriptor.kind === FRAMED_SYNC_RESOURCE_FACT_KIND;

/** Ready metadata and durable bodies remain inside the original business transaction. */
export async function applyVerifiedDesktopFramedSyncInbound(input: {
  db: DbPort; transfers: readonly DesktopFramedVerifiedInbound[];
}) {
  const applied = await input.db.transaction(async (tx) => {
    if (!input.transfers.length) await assertSyncGroupLocalPublicationAllowed(tx);
    for (const transfer of input.transfers) {
      if (!await assertSyncGroupOverwriteInbound(tx, transfer.context)) await assertSyncGroupLocalPublicationAllowed(tx);
    }
    const databaseTransfers = input.transfers.filter((transfer) => !resourceUnit(transfer));
    await recordFramedSyncPinnedResourceAvailability(tx, databaseTransfers.map((transfer) => transfer.transferId));
    const hostName = databaseTransfers.some((transfer) => transfer.objectType === 'setting') ? await readDesktopHostName(tx) : null;
    const result = await applyFramedFactSources(tx, databaseTransfers.map((transfer) => async function* (db: DbPort) {
      for await (const { fact } of streamDesktopFramedSyncReadySourceFacts(db, transfer)) yield fact;
    }), {
      enqueueSearchInvalidations: true,
      objectOptions: { ...(hostName ? { hostName } : {}), onPayloadAppliedInTransaction: materializeDesktopSettingRecord }
    });
    await recordDesktopFramedSourceProgress(tx, databaseTransfers);
    const receipts = [];
    for (const transfer of input.transfers) receipts.push(await (resourceUnit(transfer)
      ? commitDesktopFramedResourceSourceInbound(tx, transfer) : createDesktopFramedReceipt(tx, transfer)));
    return { ...result, receipts };
  });
  const staging = createDesktopFramedSyncStaging(input.db);
  for (const transfer of input.transfers) await staging.releasePins(transfer.transferId, 'business_reference_committed');
  return applied;
}
