import { parseImageSources, serializeImageSources } from '../../../../../lib/core/database/imageSources';
import { buildNodeBodyContentSql } from '../../../../../lib/core/database/nodeBodyResolution';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { RecoverableImageArticle } from '../../../../../lib/core/import/articleImageRecovery';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { applyAttachmentObject } from '../../../../../lib/core/sync/syncObjectAttachmentPayloadExecutor';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import type { importCompanionImageResource } from './companionImageImporter';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

async function loadNode(db: DbPort, nodeId: string) {
  const [row] = await db.query<WorkspaceNodeRowShape & DbRow>(
    `SELECT n.*, ${buildNodeBodyContentSql()} AS content,
      (SELECT position FROM node_order WHERE node_id = n.id) AS position
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND (n.body_blob_hash IS NULL OR cbd.hash IS NOT NULL)`, [nodeId]
  );
  if (!row) return null;
  const node = buildWorkspaceSnapshotNode(row);
  node.position = typeof row.position === 'number' ? row.position : null;
  const links = await db.query<{ attachment_id: string; role: string }>(
    'SELECT attachment_id, role FROM node_attachments WHERE node_id = ?', [nodeId]
  );
  node.attachments = links.map((link) => ({ attachmentId: link.attachment_id, role: link.role, mimeType: null, originalName: null }));
  return node;
}

export function readCompanionImageArticle(nodeId: string) {
  return getIosCompanionDatabaseOwner().read(async (db): Promise<RecoverableImageArticle | null> => {
    const node = await loadNode(db, nodeId);
    return node ? { content: node.content, imageSources: parseImageSources(node.imageSources) } : null;
  });
}

export function commitCompanionImageArticle(nodeId: string, before: RecoverableImageArticle, after: RecoverableImageArticle) {
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(async (db) => {
    const node = await loadNode(db, nodeId);
    if (!node || node.content !== before.content ||
        serializeImageSources(node.imageSources ?? {}) !== serializeImageSources(before.imageSources)) return false;
    const version = await toWorkspaceNativeNodeVersion({
      ...node, content: after.content, imageSources: after.imageSources,
      openingText: resolveNodeOpeningText(after.content, node.title), updatedAt: new Date().toISOString()
    }, await iosCompanionHostName(db));
    const result = await applySyncNodesWithDbPort(db, [version], { operation: 'local_mutation', enqueueSearchInvalidations: false });
    return result.appliedIds.includes(nodeId);
  }));
}

export async function saveCompanionImportedImage(db: DbPort, image: Awaited<ReturnType<typeof importCompanionImageResource>>) {
  const now = new Date().toISOString();
  const hostName = await iosCompanionHostName(db);
  const blob = {
    attachment_id: image.contentHash, content_hash: image.contentHash, storage_key: image.storageKey,
    size_bytes: image.sizeBytes, mime_type: image.mimeType, availability: 'local', source_host_name: hostName,
    created_at: now, cached_at: now, last_verified_at: now
  };
  const payload = { id: image.contentHash, original_name: image.storageKey, mime_type: image.mimeType,
    size_bytes: image.sizeBytes, created_at: now, blob };
  const contentHash = await iosCompanionContentHash(payload);
  await db.transaction(async (tx) => {
    const [existing] = await tx.query<{ id: string }>('SELECT id FROM attachments WHERE id = ?', [image.contentHash]);
    if (existing) {
      await tx.run("UPDATE attachment_blobs SET availability = 'local', cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
        [now, now, image.contentHash]);
      return;
    }
    await applyAttachmentObject(tx, { object_id: image.contentHash, object_type: 'attachment',
      content_hash: contentHash, payload_json: JSON.stringify(payload), updated_at: now, deleted_at: null });
    await tx.run("UPDATE attachment_blobs SET availability = 'local', cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
      [now, now, image.contentHash]);
    await markIosCompanionMutation({ contentHash, db: tx, hostName, objectId: image.contentHash,
      objectType: 'attachment', updatedAt: now });
  });
}
