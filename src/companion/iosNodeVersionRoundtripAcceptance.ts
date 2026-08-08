import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { pushLocalDirtyObjects } from '../shared/platform/companionDesktopSyncPush';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { createSignedRequestHeaders } from '../shared/platform/companionWorkspacePairing';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { persistCompanionCapturedText } from './companionCaptureTextActions';
import { restoreCompanionTrashNode } from './companionTrashActions';

const RESTORE_NODE_ID = 'ios-acceptance-restore';
const SUCCESSOR_PATH = '/acceptance/sync-pack/successor';

export async function runIosNodeVersionRoundtripAcceptance(endpoint: string, deviceId: string) {
  const capture = await persistCompanionCapturedText({
    deviceId,
    snapshot: initialSnapshot(),
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
  return applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: SUCCESSOR_PATH }),
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

function initialSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID],
    nodesById: {
      [INBOX_NODE_ID]: node({
        currentVersionId: 'acceptance-desktop#0', id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox'
      }),
      [RESTORE_NODE_ID]: node({
        currentVersionId: 'acceptance-desktop#1',
        deletedAt: '2026-07-21T00:00:20.000Z',
        id: RESTORE_NODE_ID,
        title: 'Trashed acceptance'
      })
    },
    trashedNodeDeletedAtById: { [RESTORE_NODE_ID]: '2026-07-21T00:00:20.000Z' },
    trashedNodeIds: [RESTORE_NODE_ID],
    untitledSequenceByParent: {}
  };
}

function node(args: {
  currentVersionId: string;
  deletedAt?: string;
  id: string;
  kind?: 'folder' | 'topic';
  title: string;
}) {
  return {
    anchorLink: null,
    content: args.id === RESTORE_NODE_ID ? 'Restore body' : '',
    createdAt: args.id === RESTORE_NODE_ID ? '2026-07-21T00:00:10.000Z' : '2026-07-21T00:00:00.000Z',
    currentVersionId: args.currentVersionId,
    ...(args.deletedAt ? { deletedAt: args.deletedAt } : {}),
    hideTitleHeading: false,
    id: args.id,
    isTitleManual: false,
    kind: args.kind ?? 'topic',
    openingText: null,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: args.deletedAt ?? '2026-07-21T00:00:00.000Z'
  };
}
