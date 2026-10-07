import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncNodeResources } from '../../lib/core/sync/framedSyncNodeResources.js';
import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { applyVerifiedFramedFactUnits } from '../../lib/core/sync/framedSyncVerifiedFactApply.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';

import { createDesktopFramedReceipt, recordDesktopFramedSourceProgress } from './desktopFramedSyncApplyLifecycle.js';
import { adoptDesktopStagedBody } from './desktopFramedSyncBodyAdoption.js';
import type { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';
import { collectVerifiedDesktopFramedRestoreBodies, finishVerifiedDesktopFramedRestore,
  prepareVerifiedDesktopFramedRestore, type VerifiedRestoreInput } from './desktopFramedSyncVerifiedRestore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export type DesktopFramedVerifiedInbound = NonNullable<Awaited<ReturnType<typeof loadDesktopFramedSyncReadyFacts>>>;

/** Ready metadata and durable bodies remain inside the original business transaction. */
export async function applyVerifiedDesktopFramedSyncInbound(input: {
  db: DbPort; transfers: readonly DesktopFramedVerifiedInbound[];
} & VerifiedRestoreInput) {
  const applied = await input.db.transaction(async (tx) => {
    if (!input.adoption && !input.restore) await assertSyncGroupLocalPublicationAllowed(tx);
    const restored = await prepareVerifiedDesktopFramedRestore(tx, input);
    const now = new Date().toISOString();
    for (const transfer of input.transfers) for (const descriptor of transfer.blobs) {
      if (descriptor.role === 1 || descriptor.role === 5) {
        await adoptDesktopStagedBody(tx, transfer, descriptor, now, 'chunked');
      }
    }
    const facts = input.transfers.flatMap((transfer) => transfer.facts);
    const resources = facts.filter((fact) => fact.kind === 2).flatMap((fact) =>
      readFramedSyncNodeResources(restoreFramedSyncNodeMetadata(fact).snapshot.resource_references)
        .map((resource) => resource.contentHash));
    await recordFramedSyncResourceAvailability(tx, resources, true);
    const hostName = facts.some((fact) => fact.objectType === 'setting') ? await readDesktopHostName(tx) : null;
    const result = await applyVerifiedFramedFactUnits(tx, input.transfers.map((transfer) => transfer.facts), {
      ...(input.adoption || input.restore ? { operation: 'local_restore' } : {}),
      objectOptions: { ...(hostName ? { hostName } : {}), onPayloadAppliedInTransaction: materializeDesktopSettingRecord }
    });
    await recordDesktopFramedSourceProgress(tx, input.transfers);
    await finishVerifiedDesktopFramedRestore(tx, input, restored);
    const receipts = [];
    for (const transfer of input.transfers) receipts.push(await createDesktopFramedReceipt(tx, transfer, 'chunked'));
    if (input.adoption || input.restore) await collectVerifiedDesktopFramedRestoreBodies(tx);
    return { ...result, receipts, removedNodeIds: restored.removedNodeIds };
  });
  if (input.adoption || input.restore) notifyWorkspaceSyncApplied({
    appliedNodeIds: [...new Set([...applied.removedNodeIds,
      ...input.transfers.filter((transfer) => transfer.objectType === 'node').map((transfer) => transfer.globalId)])],
    appliedObjectIds: input.transfers.filter((transfer) => transfer.objectType !== 'node')
      .map((transfer) => `${transfer.objectType}:${transfer.globalId}`),
    appliedReviewOpIds: input.transfers.flatMap((transfer) => transfer.facts)
      .filter((fact) => fact.kind === 4).map((fact) => fact.factId)
  });
  const staging = createDesktopFramedSyncStaging(input.db, 'chunked');
  for (const transfer of input.transfers) await staging.releasePins(transfer.transferId, 'business_reference_committed');
  return applied;
}
