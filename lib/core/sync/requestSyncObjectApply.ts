import { hexToBytes } from '@noble/hashes/utils.js';

import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';
import { NODE_CHILD_STATE_TYPES } from '../database/nodeChildStateSql.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { applyFramedFactSources, type FramedFactSource } from './framedSyncFactApply.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import type { FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { assertNodeVersionPeerEpoch } from './nodeVersionPeerProof.js';
import { openRequestSyncInbound, recordRequestSyncInbound, type RequestSyncBatchScope } from './requestSyncBatchScope.js';
import { changesCurrentVersion, finishReceivedNode, receivedObjectFacts } from './requestSyncObjectFacts.js';
import { reconcileAdoptedPeerEpoch } from './syncGroupAdoptedPeerEpoch.js';
import type { DeferredVisibilityPruning } from './syncNodeVisibilityPruning.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

export interface RequestSyncObjectInput {
  context: FramedSyncContext;
  globalId: string;
  objectType: string;
  requestId: Uint8Array;
  currentVersionId?: string;
  peerState: SyncGroupMemberStatePayload;
  facts: FramedFactSource;
  loadBody: FramedBodyLoader;
  objectOptions?: ApplySyncObjectsWithDbPortOptions;
  enqueueSearchInvalidations?: boolean;
  signal?: AbortSignal;
  visibilityPruning?: DeferredVisibilityPruning;
  batch?: RequestSyncBatchScope;
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

/** Runs the sender and receiver-state checks a whole received batch shares. */
export function openRequestSyncObjectInbound(tx: DbPort, input: RequestSyncObjectInput) {
  return openRequestSyncInbound(tx, input.context, overwriting => assertPeer(tx, input, overwriting));
}

/** The response is transient. Only business facts and progress commit, together, for one object. */
export function applyRequestSyncObject(db: DbPort, input: RequestSyncObjectInput) {
  return db.transaction(async tx => {
    input.signal?.throwIfAborted();
    if (!input.batch) await openRequestSyncInbound(tx, input.context, value => assertPeer(tx, input, value));
    let collectBodies = await changesCurrentVersion(tx, input);
    const source = receivedObjectFacts(input, () => { collectBodies = true; });
    const result = await applyFramedFactSources(tx, [source], { loadBody: input.loadBody,
      ...(input.objectOptions ? { objectOptions: input.objectOptions } : {}),
      ...(input.objectType === 'node' && input.currentVersionId
        ? { currentVersion: { globalId: input.globalId, versionId: input.currentVersionId } } : {}),
      ...(input.visibilityPruning ? { visibilityPruning: input.visibilityPruning } : {}),
      ...(input.batch ? { parentOrderFlush: input.batch.parentOrder } : {}),
      requireCompleteVersionGraph: true, enqueueSearchInvalidations: input.enqueueSearchInvalidations ?? true });
    if (!input.batch) await recordRequestSyncInbound(tx, input.context, input.requestId);
    await finishReceivedNode(tx, input, collectBodies);
    // A batch reports per-object success only; the single-object path returns the applied state.
    const sharedStateHash = input.batch ? undefined : await readAppliedStateHash(tx, input);
    input.signal?.throwIfAborted();
    const workspaceScope = input.objectType === 'foreground_source'
      ? { kind: 'nodes' as const, nodeIds: [] } : input.objectType === 'node' && result.workspaceScope.kind === 'nodes'
      ? { ...result.workspaceScope, nodeIds: [...new Set([...result.workspaceScope.nodeIds, input.globalId])] }
      : result.workspaceScope;
    return { ...result, sharedStateHash, workspaceScope };
  });
}

async function readAppliedStateHash(db: DbPort, input: RequestSyncObjectInput) {
  const standaloneChild = NODE_CHILD_STATE_TYPES.some(type => type === input.objectType)
    && !(input.objectType === 'parent_child_order' && input.globalId === ROOT_CHILD_ORDER_ID);
  if (standaloneChild) {
    const [state] = await db.query<{ content_hash: string }>(`SELECT content_hash FROM sync_object_state
      WHERE object_type = ? AND object_id = ?`, [input.objectType, input.globalId]);
    if (!state) throw new Error('request_sync_applied_state_missing');
    return hexToBytes(state.content_hash);
  }
  const entry = await readFramedSyncInventoryEntry(db, input);
  if (!entry) throw new Error('request_sync_applied_state_missing');
  return entry.sharedStateHash;
}
