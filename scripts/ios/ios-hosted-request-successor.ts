import { openDatabaseConnection } from '../../electron/database/connection.js';
import { upsertVersionedNodeContentWithAnchors } from '../../electron/database/nodeVersionedMutations.js';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from '../../lib/core/database/workspaceSnapshotHelpers.js';

const captureVersionId = 'ver_00000000-0000-4000-8000-000000000146';
const restoreVersionId = 'ver_00000000-0000-4000-8000-000000000147';
export const IOS_HOSTED_SUCCESSOR_VERSION_ID = 'ver_00000000-0000-4000-8000-000000000148';

/** The caller owns the already isolated acceptance library connection. */
export function advanceIosHostedRequestSuccessor() {
  const { sqlite } = openDatabaseConnection();
  const capture = sqlite.prepare('SELECT object_id FROM node_sync_versions WHERE version_id = ?')
    .get(captureVersionId) as { object_id: string } | undefined;
  const restore = sqlite.prepare('SELECT object_id FROM node_sync_versions WHERE version_id = ?')
    .get(restoreVersionId) as { object_id: string } | undefined;
  if (!capture || restore?.object_id !== 'ios-acceptance-restore') return { ready: false, created: false };
  const existing = sqlite.prepare('SELECT object_id FROM node_sync_versions WHERE version_id = ?')
    .get(IOS_HOSTED_SUCCESSOR_VERSION_ID) as { object_id: string } | undefined;
  if (existing && existing.object_id !== capture.object_id) throw new Error('ios_hosted_successor_identity_mismatch');
  if (!existing) createSuccessor(capture.object_id);
  return { ready: true, created: !existing, captureNodeId: capture.object_id,
    restoreNodeId: restore.object_id, captureVersionId, restoreVersionId, successorVersionId: IOS_HOSTED_SUCCESSOR_VERSION_ID };
}

function createSuccessor(nodeId: string) {
  const row = openDatabaseConnection().sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId) as WorkspaceNodeRowShape | undefined;
  if (!row || row.current_version_id !== captureVersionId || row.deleted_at) {
    throw new Error('ios_hosted_successor_capture_not_current');
  }
  const node = buildWorkspaceSnapshotNode(row);
  upsertVersionedNodeContentWithAnchors({
    anchorLink: node.anchorLink, content: 'Mac successor body', createdAt: node.createdAt,
    desiredRetention: node.desiredRetention, enableShortTerm: node.enableShortTerm,
    hideTitleHeading: node.hideTitleHeading, imageRegions: node.imageRegions, imageSources: node.imageSources,
    isTitleManual: node.isTitleManual, kind: node.kind, manualChildOrder: node.manualChildOrder,
    nodeId, openingText: node.openingText, parentNodeId: node.parentNodeId, position: node.position ?? null,
    priority: node.priority, reveal: node.reveal, sequentialReadingEnabled: node.sequentialReadingEnabled,
    shelvedAt: node.shelvedAt, title: 'Mac successor acceptance', updatedAt: '2026-07-21T00:04:00.000Z',
    virtualFilter: node.virtualFilter
  }, [], { versionId: IOS_HOSTED_SUCCESSOR_VERSION_ID });
}
