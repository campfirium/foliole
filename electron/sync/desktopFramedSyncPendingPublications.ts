import { readFramedSyncPublication } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';

import { prepareDesktopFramedSyncPublishedTransfer,
  sendDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import type { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

type EndpointInput = Parameters<typeof createDesktopFramedSyncRoundEndpoint>[0];

/** Reconnect drains durable deliveries even when the current inventories agree. */
export async function resumeDesktopFramedSyncPendingPublications(input: EndpointInput) {
  const rows = await input.db.query<DbRow>(`SELECT publication.*
    FROM framed_sync_outbound_publications publication
    JOIN framed_sync_outbound_holds hold ON hold.transfer_id = publication.transfer_id
    WHERE publication.state IN ('published', 'receipt_committed') AND publication.group_id = ?
      AND publication.sender_device_id = ? AND publication.sender_library_epoch = ?
      AND publication.receiver_device_id = ? AND publication.receiver_library_epoch = ?
      AND hold.member_id = publication.receiver_device_id ORDER BY publication.rowid`,
  [input.groupId, input.local.deviceId, input.local.libraryEpoch,
    input.peer.deviceId, input.peer.libraryEpoch]);
  for (const row of rows) {
    const publication = readFramedSyncPublication(row);
    if (row.state === 'receipt_committed') {
      await input.staging.releaseOutboundHolds(publication.transferId);
      continue;
    }
    const attempt = await prepareDesktopFramedSyncPublishedTransfer({ ...input, publication });
    await sendDesktopFramedSyncPublishedTransfer({ ...input, attempt, publication });
  }
  return rows.length;
}
