import { pushLocalDirtyObjects } from '../shared/platform/companionDesktopSyncPush';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { createSignedRequestHeaders } from '../shared/platform/companionWorkspacePairing';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { persistCompanionCapturedText } from './companionCaptureTextActions';
import { restoreCompanionTrashNode } from './companionTrashActions';
import { loadIosAcceptanceSyncPeer } from './iosAcceptancePairing';

const RESTORE_NODE_ID = 'ios-acceptance-restore';
const SUCCESSOR_PATH = '/acceptance/sync-pack/successor';

export async function runIosNodeVersionRoundtripAcceptance(endpoint: string, deviceId: string) {
  const initialSnapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  if (!initialSnapshot) throw new Error('ios_node_version_roundtrip_snapshot_missing');
  const capture = await persistCompanionCapturedText({
    deviceId,
    snapshot: initialSnapshot,
    text: 'iOS quick capture acceptance'
  });
  const restored = await restoreCompanionTrashNode({
    deviceId,
    nodeId: RESTORE_NODE_ID,
    snapshot: capture.snapshot
  });
  if (!restored) throw new Error('ios_node_version_roundtrip_restore_missing');
  const push = await pushLocalDirtyObjects(endpoint);
  if (push.pushError || push.pushConflictCount !== 0 || push.pushRejectedCount !== 0) {
    throw new Error(`ios_node_version_roundtrip_push_failed:${push.pushError ?? 'rejected'}`);
  }
  const successor = await applySuccessor(endpoint);
  return {
    capture_node_id: capture.nodeId,
    gates: readMutationGates(),
    push,
    restore_node_id: restored.nodeId,
    successor
  };
}

export async function rerunIosNodeVersionRoundtripAcceptance(endpoint: string) {
  return {
    gates: readMutationGates(),
    push: await pushLocalDirtyObjects(endpoint),
    successor: await applySuccessor(endpoint)
  };
}

async function applySuccessor(endpoint: string) {
  const peer = await loadIosAcceptanceSyncPeer();
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
