import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';

import { reconcileCurrentNodeBody } from './currentNodeBodyProjection.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { applyFramedFactSources, type FramedFactSource } from './framedSyncFactApply.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import type { FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { recordFramedSyncPeerEpoch } from './framedSyncPeerEpoch.js';
import { publishLocalNodePosition } from './nodeVersionMemberPositionPublish.js';
import { assertNodeVersionPeerEpoch } from './nodeVersionPeerProof.js';
import { advanceLocalSourceRevision } from './nodeVersionSourceRevision.js';
import { requestSyncPositionReady } from './requestSyncBodyRetention.js';
import { reconcileAdoptedPeerEpoch } from './syncGroupAdoptedPeerEpoch.js';
import { assertSyncGroupLocalPublicationAllowed } from './syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from './syncGroupOverwriteProgress.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

export interface RequestSyncObjectInput {
  context: FramedSyncContext;
  globalId: string;
  objectType: string;
  requestId: Uint8Array;
  peerState: SyncGroupMemberStatePayload;
  facts: FramedFactSource;
  loadBody: FramedBodyLoader;
  objectOptions?: ApplySyncObjectsWithDbPortOptions;
  enqueueSearchInvalidations?: boolean;
  signal?: AbortSignal;
}

async function assertPeer(tx: DbPort, input: RequestSyncObjectInput, overwriting: boolean) {
  const { context, peerState } = input;
  if (peerState.group_id !== context.groupId || peerState.sender_device_identity_key !== context.senderDeviceId ||
      peerState.library_epoch !== context.senderLibraryEpoch) throw new Error('request_sync_peer_context_mismatch');
  const [active] = await tx.query(`SELECT 1 FROM sync_group_devices peer JOIN sync_group_local_state local
    ON local.group_id = peer.group_id WHERE peer.group_id = ? AND peer.device_identity_key = ?
    AND peer.state = 'active' AND local.state = 'active' AND local.local_device_identity_key = ?
    AND EXISTS (SELECT 1 FROM node_version_local_proof_state WHERE singleton_id = 1 AND library_epoch = ?)`,
  [context.groupId, context.senderDeviceId, context.receiverDeviceId, context.receiverLibraryEpoch]);
  if (!active) throw new Error('request_sync_peer_inactive');
  if (overwriting) return;
  await reconcileAdoptedPeerEpoch(tx, peerState);
  const [known] = await tx.query<{ library_epoch: string }>(
    'SELECT library_epoch FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?',
    [context.groupId, context.senderDeviceId]);
  // Member exchange already checked this request's proof; concurrent exchanges may advance it.
  assertNodeVersionPeerEpoch(known?.library_epoch, peerState.library_epoch);
}

/** The response is transient. Only business facts and progress commit, together, for one object. */
export function applyRequestSyncObject(db: DbPort, input: RequestSyncObjectInput) {
  return db.transaction(async tx => {
    input.signal?.throwIfAborted();
    const overwriting = await assertSyncGroupOverwriteInbound(tx, input.context);
    await assertPeer(tx, input, overwriting);
    if (!overwriting) await assertSyncGroupLocalPublicationAllowed(tx);
    const source: FramedFactSource = async function* (port) {
      for await (const fact of input.facts(port)) {
        if (fact.globalId !== input.globalId || fact.objectType !== input.objectType) {
          throw new Error('request_sync_object_identity_mismatch');
        }
        yield fact;
      }
    };
    const result = await applyFramedFactSources(tx, [source], { loadBody: input.loadBody,
      ...(input.objectOptions ? { objectOptions: input.objectOptions } : {}),
      requireCompleteVersionGraph: true, enqueueSearchInvalidations: input.enqueueSearchInvalidations ?? true });
    if (input.objectType === 'node') {
      await reconcileCurrentNodeBody(tx, input.globalId, input.enqueueSearchInvalidations ?? true);
    }
    await advanceLocalSourceRevision(tx, input.context.senderDeviceId);
    await recordFramedSyncPeerEpoch(tx, { groupId: input.context.groupId, libraryEpoch: input.context.senderLibraryEpoch,
      peerDeviceId: input.context.senderDeviceId, transferId: input.requestId });
    if (!overwriting && input.objectType === 'node') {
      await publishLocalNodePosition(tx, input.globalId, requestSyncPositionReady);
    }
    const entry = await readFramedSyncInventoryEntry(tx, input);
    if (!entry) throw new Error('request_sync_applied_state_missing');
    input.signal?.throwIfAborted();
    return { ...result, sharedStateHash: entry.sharedStateHash };
  });
}
