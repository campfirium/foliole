import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { parseStoredImageRegions } from '../../lib/core/database/imageRegionCodec.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { upsertVersionedNodeContentWithAnchors } from '../database/nodeVersionedMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { asString, parseNodeAnchorLocatorUpdateArray, parseNodeSnapshotArgs } from './commandParsers.js';
import { readObjectArg } from './storageCommandSupport.js';
import { buildNodeMutationPatchResult, type OriginWindow } from './storageNodeMutationResult.js';

export async function handleLocalContentEditCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
  const edit = readObjectArg(args.edit, 'edit');
  const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
  const versionId = asString(edit.versionId, 'versionId');
  const hostName = loadOrCreateDesktopHostName(parent.updatedAt);
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const result = await applyLocalContentEdit(port, {
    baseVersionId: asString(edit.baseVersionId, 'baseVersionId'),
    versionId,
    content: parent.content,
    hideTitleHeading: parent.hideTitleHeading ?? false,
    hostName,
    nodeId: parent.nodeId,
    title: parent.title,
    updatedAt: parent.updatedAt
  }, () => {
    upsertVersionedNodeContentWithAnchors(parent, affectedAnchors, { versionId });
  });
  const children = await port.query<{ id: string; anchor_link: string | null; image_regions: string | null; updated_at: string }>(
    'SELECT id, anchor_link, image_regions, updated_at FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [parent.nodeId]
  );
  const anchorUpdates = children.flatMap((child) => {
    const anchorLink = parseStoredAnchorLink(child.anchor_link);
    return anchorLink ? [{ nodeId: child.id, anchorLink, imageRegions: parseStoredImageRegions(child.image_regions), updatedAt: child.updated_at }] : [];
  });
  const updatedNodeIds = [parent.nodeId, ...anchorUpdates.map((child) => child.nodeId)];
  enqueueCoalescedWorkspaceSearchInvalidation(updatedNodeIds);
  scheduleMirrorSync(updatedNodeIds);
  return {
    ...(buildNodeMutationPatchResult({
      anchorUpdates,
      nodes: [{
        ...parent,
        content: result.current.body_text ?? '',
        hideTitleHeading: result.current.snapshot.hide_title_heading,
        title: result.current.snapshot.title,
        updatedAt: result.current.updated_at
      }],
      originWindow,
      updatedNodeIds
    }) as object),
    contentEdit: {
      currentVersionId: result.current.version_id!,
      submittedVersionId: result.submittedVersionId
    }
  };
}
