import { hexToBytes } from '@noble/hashes/utils.js';

import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';
import { DELETED_NODE_SQL, releaseDeletedNodeBodiesWithPort } from '../database/deletedNodeBodyRelease.js';
import { NODE_CHILD_STATE_TYPES } from '../database/nodeChildStateSql.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';

import { reconcileCurrentNodeBody } from './currentNodeBodyProjection.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { applyFramedFactSources, type FramedFactSource } from './framedSyncFactApply.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { parseFramedSyncNodeChildIdentity } from './framedSyncNodeChildFact.js';
import type { FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { recordFramedSyncPeerEpoch } from './framedSyncPeerEpoch.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { assertNodeVersionPeerEpoch } from './nodeVersionPeerProof.js';
import { advanceLocalSourceRevision } from './nodeVersionSourceRevision.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { reconcileAdoptedPeerEpoch } from './syncGroupAdoptedPeerEpoch.js';
import { assertSyncGroupLocalPublicationAllowed } from './syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from './syncGroupOverwriteProgress.js';
import { assertCurrentNodeParentChain } from './syncNodeParentChain.js';
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
    let collectBodies = await changesCurrentVersion(tx, input);
    const source: FramedFactSource = async function* (port, kinds) {
      for await (const fact of input.facts(port, kinds)) {
        if (fact.globalId !== input.globalId || fact.objectType !== input.objectType) {
          throw new Error('request_sync_object_identity_mismatch');
        }
        if (input.objectType === 'node' && (fact.kind === 2 || fact.kind === 3 ||
            (fact.kind === 1 && parseFramedSyncNodeChildIdentity(fact.factId).objectType === 'node_text_alternative'))) {
          collectBodies = true;
        }
        yield fact;
      }
    };
    const result = await applyFramedFactSources(tx, [source], { loadBody: input.loadBody,
      ...(input.objectOptions ? { objectOptions: input.objectOptions } : {}),
      ...(input.objectType === 'node' && input.currentVersionId
        ? { currentVersion: { globalId: input.globalId, versionId: input.currentVersionId } } : {}),
      ...(input.visibilityPruning ? { visibilityPruning: input.visibilityPruning } : {}),
      requireCompleteVersionGraph: true, enqueueSearchInvalidations: input.enqueueSearchInvalidations ?? true });
    if (input.objectType === 'node') {
      await assertCurrentNodeParentChain(tx, input.globalId);
      await reconcileCurrentNodeBody(tx, input.globalId, input.enqueueSearchInvalidations ?? true);
      await releaseReceivedDeletionBodies(tx, input.globalId);
    }
    await advanceLocalSourceRevision(tx, input.context.senderDeviceId);
    await recordFramedSyncPeerEpoch(tx, { groupId: input.context.groupId, libraryEpoch: input.context.senderLibraryEpoch,
      peerDeviceId: input.context.senderDeviceId, transferId: input.requestId });
    if (collectBodies) await collectNodeVersionPayloads(tx, input.globalId, Number.MAX_SAFE_INTEGER);
    const sharedStateHash = await readAppliedStateHash(tx, input);
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

async function changesCurrentVersion(db: DbPort, input: RequestSyncObjectInput) {
  if (input.objectType !== 'node' || !input.currentVersionId) return false;
  const [node] = await db.query<{ current_version_id: string | null }>(REQUEST_CHAIN_HEAD_SQL, [input.globalId]);
  return node?.current_version_id !== input.currentVersionId;
}

/** A received permanent deletion leaves no copy of the note's text on this device either. */
async function releaseReceivedDeletionBodies(tx: DbPort, nodeId: string) {
  if (!(await tx.query(DELETED_NODE_SQL, [nodeId])).length) return;
  const hashes = await releaseDeletedNodeBodiesWithPort(tx, nodeId);
  if (hashes.length) await collectTextBodyBlobCandidatesWithPort(tx, hashes);
}
