import { framedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { sendWithRequiredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyDelivery.js';
import { collectDeliveredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { loadSyncGroupLocalAdoption, isSyncGroupPeerAdopting } from '../../lib/core/sync/syncGroupLocalAdoption.js';

import { prepareDesktopFramedSyncPublishedTransfer,
  sendDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

type EndpointInput = Parameters<typeof createDesktopFramedSyncRoundEndpoint>[0];

/** Reconnect drains durable deliveries even when the current inventories agree. */
export async function resumeDesktopFramedSyncPendingPublications(input: EndpointInput) {
  if (await loadSyncGroupLocalAdoption(input.db) ||
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
  for (const row of rows) {
    const transferId = framedSyncBytes(row, 'transfer_id');
    if (row.state === 'receipt_committed') {
      await input.staging.releaseOutboundHolds(transferId);
      await collectDeliveredParentOrderBodies(input.db, transferId);
      continue;
    }
    const publication = await input.staging.loadOutboundPublication(transferId);
    if (!publication) throw new Error('framed_sync_outbound_publication_missing');
    const attempt = await prepareDesktopFramedSyncPublishedTransfer({ ...input, publication });
    await sendWithRequiredParentOrderBodies(
      () => sendDesktopFramedSyncPublishedTransfer({ ...input, attempt, publication }),
      (versionId) => supplyOrderBody(input, versionId));
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
