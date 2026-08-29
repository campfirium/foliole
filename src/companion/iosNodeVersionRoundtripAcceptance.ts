import {
  IOS_SYNC_PACK_CAPTURED_AT,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_MUTATION_AUTHOR,
  IOS_SYNC_PACK_RESTORED_AT,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract';
import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { pushLocalDirtyObjects } from '../shared/platform/companionDesktopSyncPush';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { persistCompanionCapturedText } from './companionCaptureTextActions';
import { restoreCompanionTrashNode } from './companionTrashActions';
const RESTORE_NODE_ID = 'ios-acceptance-restore';
const SUCCESSOR_PATH = '/acceptance/sync-pack/successor';
type SyncPeer = { sourceHostName: string; sourcePeerId: string };

export async function runIosNodeVersionRoundtripAcceptance(endpoint: string, peer: SyncPeer) {
  const initialSnapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  if (!initialSnapshot) throw new Error('ios_node_version_roundtrip_snapshot_missing');
  const capture = await persistCompanionCapturedText({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    now: IOS_SYNC_PACK_CAPTURED_AT,
    snapshot: initialSnapshot,
    text: 'iOS quick capture acceptance',
    versionId: IOS_SYNC_PACK_CAPTURE_VERSION_ID
  });
  const restored = await restoreCompanionTrashNode({
    deviceId: IOS_SYNC_PACK_MUTATION_AUTHOR,
    nodeId: RESTORE_NODE_ID,
    now: IOS_SYNC_PACK_RESTORED_AT,
    snapshot: capture.snapshot,
    versionId: IOS_SYNC_PACK_RESTORE_VERSION_ID
  });
  if (!restored) throw new Error('ios_node_version_roundtrip_restore_missing');
  const push = await pushLocalDirtyObjects(endpoint);
  if (push.pushError || push.pushConflictCount !== 0 || push.pushRejectedCount !== 0) {
    throw new Error(`ios_node_version_roundtrip_push_failed:${push.pushError ?? 'rejected'}`);
  }
  const successor = await applySuccessor(endpoint, peer);
  return {
    capture_node_id: capture.nodeId,
    gates: readMutationGates(),
    push,
    restore_node_id: restored.nodeId,
    successor
  };
}

export async function rerunIosNodeVersionRoundtripAcceptance(endpoint: string, peer: SyncPeer) {
  return {
    gates: readMutationGates(),
    push: await pushLocalDirtyObjects(endpoint),
    successor: await applySuccessor(endpoint, peer)
  };
}

async function applySuccessor(endpoint: string, peer: SyncPeer) {
  return applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: SUCCESSOR_PATH }),
    ...peer,
    url: `${endpoint}${SUCCESSOR_PATH}`
  });
}

function readMutationGates() {
  return Object.fromEntries([
    'existing-highlight-edit',
    'quick-capture',
    'selection-annotation',
    'topic-content-edit',
    'trash-restore'
  ].map((surface) => [surface, supportsCompanionNodeMutationSurface(
    surface as Parameters<typeof supportsCompanionNodeMutationSurface>[0]
  )]));
}
