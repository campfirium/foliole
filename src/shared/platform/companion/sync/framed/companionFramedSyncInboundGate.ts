import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound, loadSyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';

/** Pending overwrite permits only its fixed authenticated inbound owner, never publication. */
export async function assertCompanionFramedSyncInboundAllowed(db: DbPort,
  inputs: readonly CompanionFramedSyncApplyInput[]) {
  const progress = await loadSyncGroupOverwriteProgress(db);
  if (!progress) return assertSyncGroupLocalPublicationAllowed(db);
  if (!inputs.length) throw new Error('sync_group_overwrite_source_changed');
  for (const input of inputs) await assertSyncGroupOverwriteInbound(db, {
    groupId: progress.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: input.senderDeviceId, senderLibraryEpoch: input.senderLibraryEpoch,
    receiverDeviceId: input.receiverDeviceId, receiverLibraryEpoch: input.receiverLibraryEpoch
  });
}
