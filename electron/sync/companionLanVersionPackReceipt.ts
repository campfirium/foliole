import { isConsumedNodeVersionConfirmation } from '../../lib/core/sync/nodeVersionConfirmationState.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { parseNodeVersionReceipt } from '../../lib/core/sync/nodeVersionReceiptContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { releaseConfirmedCompanionDependencySession } from './companionLanDependencySession.js';
import { releaseConfirmedCompanionFactSession } from './companionLanFactSession.js';
import { restoreKnownFactReceiptHolds } from './companionLanKnownFactPack.js';
import { releaseCompanionSourceRoundOnReceipt } from './companionLanSourceRoundView.js';

export const VERSION_PACK_RECEIPT_PATH = '/companion/version-pack-receipt';

export async function acceptCompanionVersionPackReceipt(bodyText: string, authenticatedDeviceId: string) {
  const receipt = parseNodeVersionReceipt(JSON.parse(bodyText));
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const [local] = await port.query<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  );
  if (!local || receipt.groupId !== local.group_id ||
      receipt.sourceDeviceId !== local.local_device_identity_key ||
      receipt.deviceId !== authenticatedDeviceId) {
    throw new Error('node_version_receipt_identity_mismatch');
  }
  try {
    if (!await isConsumedNodeVersionConfirmation(port, receipt)) await restoreKnownFactReceiptHolds({ groupId: receipt.groupId,
      peerId: receipt.deviceId, packId: receipt.packId,
      fromPeerId: receipt.sourceDeviceId, results: receipt.results });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'sync_pack_source_view_unavailable') throw error;
  }
  await confirmOutboundNodeVersionPack(port, {
    confirmedAt: new Date().toISOString(), deviceId: receipt.deviceId,
    groupId: receipt.groupId, libraryEpoch: receipt.libraryEpoch,
    packId: receipt.packId, proofRevision: receipt.proofRevision, results: receipt.results
  });
  await releaseConfirmedCompanionDependencySession(receipt.groupId, receipt.deviceId, receipt.packId, receipt.results);
  await releaseConfirmedCompanionFactSession(receipt.groupId, receipt.deviceId, receipt.packId);
  await releaseCompanionSourceRoundOnReceipt(receipt.groupId, receipt.deviceId, receipt.packId);
  return { accepted: true };
}
