import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { recordFramedSyncPeerEpoch } from './framedSyncPeerEpoch.js';
import { advanceLocalSourceRevision } from './nodeVersionSourceRevision.js';
import { assertSyncGroupLocalPublicationAllowed } from './syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from './syncGroupOverwriteProgress.js';

/**
 * Checks and bookkeeping that every object of one received batch shares. A batch runs them once instead of
 * per object: the sender, the overwrite state and the local publication state cannot change inside it.
 */
export interface RequestSyncBatchScope {
  overwriting: boolean;
  parentOrder: { requested: boolean };
}

export async function openRequestSyncInbound(tx: DbPort, context: FramedSyncContext,
  assertPeer: (overwriting: boolean) => Promise<void>) {
  const overwriting = await assertSyncGroupOverwriteInbound(tx, context);
  await assertPeer(overwriting);
  if (!overwriting) await assertSyncGroupLocalPublicationAllowed(tx);
  return overwriting;
}

export async function recordRequestSyncInbound(tx: DbPort, context: FramedSyncContext, transferId: Uint8Array) {
  await advanceLocalSourceRevision(tx, context.senderDeviceId);
  await recordFramedSyncPeerEpoch(tx, { groupId: context.groupId, libraryEpoch: context.senderLibraryEpoch,
    peerDeviceId: context.senderDeviceId, transferId });
}
