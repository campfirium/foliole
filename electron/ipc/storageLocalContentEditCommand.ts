import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { parseStoredImageRegions } from '../../lib/core/database/imageRegionCodec.js';
import { describeNodeBacklinkSourceChange, readNodeBacklinkSource } from '../../lib/core/database/nodeBacklinks.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { parseNewImageReferences } from '../../lib/core/sync/localContentEditResources.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { upsertVersionedNodeContentWithAnchors } from '../database/nodeVersionedMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { asNullableString, asString, parseNodeAnchorLocatorUpdateArray, parseNodeSnapshotArgs } from './commandParsers.js';
import { readObjectArg } from './storageCommandSupport.js';
import { buildNodeMutationPatchResult, type OriginWindow } from './storageNodeMutationResult.js';

export async function handleLocalContentEditCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const libraryScope = currentLibraryScope();
  const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
  const edit = readObjectArg(args.edit, 'edit');
  if (edit.field !== undefined && edit.field !== 'reveal') throw new Error('content_edit_field_invalid');
  const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
  const versionId = asString(edit.versionId, 'versionId');
  const hostName = loadOrCreateDesktopHostName(parent.updatedAt);
  const { driver, sqlite } = openDatabaseConnection();
  const previous = readNodeBacklinkSource(driver, parent.nodeId, affectedAnchors.map(anchor => anchor.nodeId));
  const port = createBetterSqliteDbPort(sqlite);
  const result = await applyLocalContentEdit(port, {
    ...(edit.field === 'reveal' ? { field: 'reveal' as const } : {}),
    ...(edit.baseContent !== undefined ? { baseContent: asString(edit.baseContent, 'baseContent') } : {}),
    ...(edit.reveal !== undefined ? { reveal: asNullableString(edit.reveal, 'reveal') } : {}),
    baseVersionId: asString(edit.baseVersionId, 'baseVersionId'),
    versionId,
    newImageReferences: parseNewImageReferences(edit.newImageReferences),
    content: parent.content,
    hideTitleHeading: parent.hideTitleHeading ?? false,
    hostName,
    nodeId: parent.nodeId,
    title: parent.title,
    updatedAt: parent.updatedAt
  }, applyContentRecord(parent, affectedAnchors, versionId));
  // applyLocalContentEdit already released the superseded bodies inside its transaction (WA-064).
  const anchorUpdates = await readContentEditAnchorUpdates(port, parent.nodeId);
  const updatedNodeIds = [parent.nodeId, ...anchorUpdates.map((child) => child.nodeId)];
  enqueueCoalescedWorkspaceSearchInvalidation(updatedNodeIds);
  scheduleMirrorSync(updatedNodeIds);
  const content = result.current.body_text ?? '';
  const title = result.current.snapshot.title;
  const backlinkSourceChange = describeNodeBacklinkSourceChange(parent.nodeId, previous, { content, title });
  return {
    ...(buildNodeMutationPatchResult({
      libraryScope, workspaceScope: { kind: 'nodes', nodeIds: updatedNodeIds },
      anchorUpdates,
      ...(backlinkSourceChange && { backlinkSourceChange }),
      nodes: [{
        ...parent,
        content,
        reveal: result.current.snapshot.reveal ?? null,
        hideTitleHeading: result.current.snapshot.hide_title_heading,
        title,
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

async function readContentEditAnchorUpdates(port: ReturnType<typeof createBetterSqliteDbPort>, nodeId: string) {
  const children = await port.query<{ id: string; anchor_link: string | null; image_regions: string | null; updated_at: string }>(
    'SELECT id, anchor_link, image_regions, updated_at FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [nodeId]
  );
  return children.flatMap((child) => {
    const anchorLink = parseStoredAnchorLink(child.anchor_link);
    return anchorLink ? [{ nodeId: child.id, anchorLink, imageRegions: parseStoredImageRegions(child.image_regions), updatedAt: child.updated_at }] : [];
  });
}

function applyContentRecord(
  parent: ReturnType<typeof parseNodeSnapshotArgs>,
  affectedAnchors: ReturnType<typeof parseNodeAnchorLocatorUpdateArray>,
  versionId: string
) {
  return (record: NativeSyncNodeRecord) => {
    const { driver } = openDatabaseConnection();
    driver.execute('UPDATE nodes SET resource_references = ?, image_sources = ? WHERE id = ?',
      [record.snapshot.resource_references!, record.snapshot.image_sources ?? null, parent.nodeId]);
    upsertVersionedNodeContentWithAnchors({ ...parent,
      content: record.body_text ?? '', title: record.snapshot.title,
      hideTitleHeading: record.snapshot.hide_title_heading ?? false,
      reveal: record.snapshot.reveal ?? null
    }, affectedAnchors, { versionId });
  };
}
