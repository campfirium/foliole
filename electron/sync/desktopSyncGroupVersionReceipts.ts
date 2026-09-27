import {
  loadPendingNodeVersionReceipts,
  markNodeVersionReceiptDelivered
} from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const VERSION_PACK_RECEIPT_PATH = '/companion/version-pack-receipt';

export async function flushDesktopSyncGroupVersionReceipts(peer: DesktopSyncGroupPeer) {
  const pending = await runWithDatabaseConnectionOwner(async () => {
    const key = loadDesktopWorkgroupKey(peer.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    return { receipts: await loadPendingNodeVersionReceipts(port, peer.peer_device_id), secret: key.group_key };
  });
  for (const receipt of pending.receipts) {
    const result = await postDesktopWorkgroupJson({
      body: JSON.stringify(receipt), endpointUrl: peer.endpoint_url,
      groupId: peer.group_id, localDeviceId: peer.local_device_id,
      pathWithQuery: VERSION_PACK_RECEIPT_PATH, secret: pending.secret
    });
    if (result.accepted !== true) throw new Error('node_version_receipt_unconfirmed');
    await runWithDatabaseConnectionOwner(async () => {
      const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
      await markNodeVersionReceiptDelivered(port, receipt.packId);
    });
  }
}
