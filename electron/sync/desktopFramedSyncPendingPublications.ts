import { framedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import { discardFramedSyncFilePreparations } from '../../lib/core/sync/framedSyncFilePreparation.js';
import { loadFramedSyncFileTask, streamFramedSyncFilePublications } from '../../lib/core/sync/framedSyncFilePublication.js';
import { completeFramedSyncFileRecovery, reconcileFramedSyncFilePublication,
  selectFramedSyncFileRecoveryPublication } from '../../lib/core/sync/framedSyncFileRecovery.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { reconcileFramedSyncPublication } from '../../lib/core/sync/framedSyncPublicationReconciliation.js';
import { completeFramedSyncRecoveredPublication, selectFramedSyncRecoveryPublication } from '../../lib/core/sync/framedSyncPublicationRecoverySelection.js';
import { isSyncGroupPeerAdopting, syncGroupLocalPublicationBlockReason } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';

import { exchangeDesktopFramedSyncInventoryHttp } from './desktopFramedSyncInventoryHttp.js';
import { prepareDesktopFramedSyncPublishedDelivery,
  sendDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import type { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

type EndpointInput = Parameters<typeof createDesktopFramedSyncRoundEndpoint>[0];

export async function hasDesktopFramedSyncPendingPublications(input: EndpointInput) {
  if (await syncGroupLocalPublicationBlockReason(input.db) ||
      await isSyncGroupPeerAdopting(input.db, input.groupId, input.peer.deviceId)) return false;
  return (await pendingPublications(input)).length > 0;
}

async function pendingPublications(input: EndpointInput) {
  if (input.files) return pendingFilePublications(input);
  return input.db.query<DbRow>(`SELECT publication.transfer_id, publication.state
    FROM framed_sync_outbound_publications publication
    JOIN framed_sync_outbound_holds hold ON hold.transfer_id = publication.transfer_id
    WHERE publication.state IN ('published', 'receipt_committed') AND publication.group_id = ?
      AND publication.sender_device_id = ? AND publication.sender_library_epoch = ?
      AND publication.receiver_device_id = ? AND publication.receiver_library_epoch = ?
      AND hold.member_id = publication.receiver_device_id ORDER BY publication.rowid`,
  [input.groupId, input.local.deviceId, input.local.libraryEpoch,
    input.peer.deviceId, input.peer.libraryEpoch]);
}

/** Reconnect checks the original missing set before retrying durable deliveries. */
export async function resumeDesktopFramedSyncPendingPublications(input: EndpointInput & { remoteInventory?: readonly FramedSyncInventoryEntry[] }) {
  if (await syncGroupLocalPublicationBlockReason(input.db) ||
      await isSyncGroupPeerAdopting(input.db, input.groupId, input.peer.deviceId)) return 0;
  const rows = await pendingPublications(input);
  if (!rows.length) return 0;
  const remoteInventory = input.remoteInventory ?? (await exchangeDesktopFramedSyncInventoryHttp({
    context: { protocolVersion: 23, groupId: input.groupId,
      initiatorDeviceId: input.local.deviceId, initiatorLibraryEpoch: input.local.libraryEpoch,
      responderDeviceId: input.peer.deviceId, responderLibraryEpoch: input.peer.libraryEpoch },
    db: input.db, endpointUrl: input.peerOrigin, groupSecret: input.groupSecret,
    groupKey: new Uint8Array(Buffer.from(input.groupSecret, 'base64url')),
    noncePort: input.files ? createFramedSyncFileSessionNoncePort(input.files) : createDesktopFramedSyncSessionNoncePort(input.db)
  })).remote;
  for (const row of rows) {
    const transferId = framedSyncBytes(row, 'transfer_id');
    if (row.state === 'receipt_committed') {
      await input.staging.releaseOutboundHolds(transferId);
      await retirePublication(input, transferId);
      continue;
    }
    if (await (input.files ? reconcileFramedSyncFilePublication(input.files, transferId, remoteInventory) :
      reconcileFramedSyncPublication(input.db, transferId, remoteInventory)) === 'satisfied') {
      await retirePublication(input, transferId);
      continue;
    }
    const publication = await (input.files ? selectFramedSyncFileRecoveryPublication(input.files, transferId, remoteInventory) :
      selectFramedSyncRecoveryPublication(input.db, transferId, remoteInventory));
    if (!publication) throw new Error('framed_sync_outbound_publication_missing');
    try {
      const delivery = await prepareDesktopFramedSyncPublishedDelivery({ ...input, publication });
      await sendDesktopFramedSyncPublishedTransfer({ ...input, ...delivery, publication });
    } catch (error) {
      if (readFramedSyncMissingDependency(error)) continue;
      throw error;
    }
    await (input.files ? completeFramedSyncFileRecovery(input.files, transferId, publication.transferId) :
      completeFramedSyncRecoveredPublication(input.db, transferId, publication.transferId));
    await retirePublication(input, publication.transferId);
    await retirePublication(input, transferId);
  }
  return rows.length;
}

function retirePublication(input: EndpointInput, transferId: Uint8Array) {
  return input.files ? input.staging.releaseOutboundHolds(transferId) : retireFramedSyncCompletedPublication(input.db, transferId);
}

async function pendingFilePublications(input: EndpointInput): Promise<DbRow[]> {
  await discardFramedSyncFilePreparations(input.files!);
  const rows: DbRow[] = [];
  for await (const publication of streamFramedSyncFilePublications(input.files!)) {
    const context = publication.context;
    if (context.groupId !== input.groupId || context.senderDeviceId !== input.local.deviceId ||
        context.senderLibraryEpoch !== input.local.libraryEpoch || context.receiverDeviceId !== input.peer.deviceId ||
        context.receiverLibraryEpoch !== input.peer.libraryEpoch) continue;
    const task = await loadFramedSyncFileTask(input.files!, publication.transferId);
    rows.push({ transfer_id: publication.transferId, state: task?.state === 'confirmed' ? 'receipt_committed' : 'published' });
  }
  return rows;
}
