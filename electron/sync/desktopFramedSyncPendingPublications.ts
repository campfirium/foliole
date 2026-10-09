import { framedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { reconcileFramedSyncPublication } from '../../lib/core/sync/framedSyncPublicationReconciliation.js';
import { completeFramedSyncRecoveredPublication, selectFramedSyncRecoveryPublication } from '../../lib/core/sync/framedSyncPublicationRecoverySelection.js';
import { sendWithRequiredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyDelivery.js';
import { collectDeliveredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { isSyncGroupPeerAdopting, syncGroupLocalPublicationBlockReason } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';

import { exchangeDesktopFramedSyncInventoryHttp } from './desktopFramedSyncInventoryHttp.js';
import { prepareDesktopFramedSyncPublishedDelivery,
  sendDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

type EndpointInput = Parameters<typeof createDesktopFramedSyncRoundEndpoint>[0];

/** Reconnect checks the original missing set before retrying durable deliveries. */
export async function resumeDesktopFramedSyncPendingPublications(input: EndpointInput & { remoteInventory?: readonly FramedSyncInventoryEntry[] }) {
  if (await syncGroupLocalPublicationBlockReason(input.db) ||
      await isSyncGroupPeerAdopting(input.db, input.groupId, input.peer.deviceId)) return 0;
  const rows = await input.db.query<DbRow>(`SELECT publication.transfer_id, publication.state
    FROM framed_sync_outbound_publications publication
    JOIN framed_sync_outbound_holds hold ON hold.transfer_id = publication.transfer_id
    WHERE publication.state IN ('published', 'receipt_committed') AND publication.group_id = ?
      AND publication.sender_device_id = ? AND publication.sender_library_epoch = ?
      AND publication.receiver_device_id = ? AND publication.receiver_library_epoch = ?
      AND hold.member_id = publication.receiver_device_id ORDER BY publication.rowid`,
  [input.groupId, input.local.deviceId, input.local.libraryEpoch,
    input.peer.deviceId, input.peer.libraryEpoch]);
  if (!rows.length) return 0;
  const remoteInventory = input.remoteInventory ?? (await exchangeDesktopFramedSyncInventoryHttp({
    context: { protocolVersion: 22, groupId: input.groupId,
      initiatorDeviceId: input.local.deviceId, initiatorLibraryEpoch: input.local.libraryEpoch,
      responderDeviceId: input.peer.deviceId, responderLibraryEpoch: input.peer.libraryEpoch },
    db: input.db, endpointUrl: input.peerOrigin, groupSecret: input.groupSecret,
    groupKey: new Uint8Array(Buffer.from(input.groupSecret, 'base64url')),
    noncePort: createDesktopFramedSyncSessionNoncePort(input.db)
  })).remote;
  for (const row of rows) {
    const transferId = framedSyncBytes(row, 'transfer_id');
    if (row.state === 'receipt_committed') {
      await input.staging.releaseOutboundHolds(transferId);
      await collectDeliveredParentOrderBodies(input.db, transferId);
      await retireFramedSyncCompletedPublication(input.db, transferId);
      continue;
    }
    if (await reconcileFramedSyncPublication(input.db, transferId, remoteInventory) === 'satisfied') {
      await collectDeliveredParentOrderBodies(input.db, transferId);
      await retireFramedSyncCompletedPublication(input.db, transferId);
      continue;
    }
    const publication = await selectFramedSyncRecoveryPublication(input.db, transferId, remoteInventory);
    if (!publication) throw new Error('framed_sync_outbound_publication_missing');
    try {
      await sendWithRequiredParentOrderBodies(
        async () => {
          const delivery = await prepareDesktopFramedSyncPublishedDelivery({ ...input, publication });
          await sendDesktopFramedSyncPublishedTransfer({ ...input, ...delivery, publication });
        },
        (versionId) => supplyOrderBody(input, versionId));
    } catch (error) {
      if (readFramedSyncMissingDependency(error)) continue;
      throw error;
    }
    await completeFramedSyncRecoveredPublication(input.db, transferId, publication.transferId);
    await retireFramedSyncCompletedPublication(input.db, publication.transferId);
    await collectDeliveredParentOrderBodies(input.db, transferId);
    await retireFramedSyncCompletedPublication(input.db, transferId);
  }
  return rows.length;
}

async function supplyOrderBody(input: EndpointInput, versionId: string) {
  const endpoint = createDesktopFramedSyncRoundEndpoint(input);
  const entry = await endpoint.readInventoryEntry({ globalId: versionId, objectType: 'order_version' });
  if (!entry) throw new Error(`sync_parent_order_body_unavailable:${versionId}`);
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  const selection = await endpoint.selectOutbound(difference!);
  if (selection.kind === 'deferred') throw new Error('framed_sync_required_body_source_changed');
  await endpoint.staging.publishOutbound(selection.publication);
  if (await endpoint.sendPublishedTransfer({ difference: difference!, publication: selection.publication,
    receiver: 'remote' }) !== 'committed') throw new Error('framed_sync_required_body_pending');
}
