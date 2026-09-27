import {
  loadPendingNodeVersionReceipts,
  markNodeVersionReceiptDelivered
} from '../../../../../lib/core/sync/nodeVersionInboundReceipt';
import { postDesktopJson } from '../../companionDesktopSyncHttp';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

const VERSION_PACK_RECEIPT_PATH = '/companion/version-pack-receipt';

export async function flushCompanionNodeVersionReceipts(endpointUrl: string, sourceDeviceId: string) {
  const pending = await getIosCompanionDatabaseOwner().read((db) =>
    loadPendingNodeVersionReceipts(db, sourceDeviceId));
  for (const receipt of pending) {
    const result = await postDesktopJson<{ accepted: boolean }>(
      endpointUrl, VERSION_PACK_RECEIPT_PATH, receipt
    );
    if (result.accepted !== true) throw new Error('node_version_receipt_unconfirmed');
    await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) =>
      markNodeVersionReceiptDelivered(db, receipt.packId)));
  }
}
