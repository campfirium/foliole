import { parseImageSources, serializeImageSources } from '../../../../../lib/core/database/imageSources';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { RecoverableImageArticle } from '../../../../../lib/core/import/articleImageRecovery';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { applyAttachmentObject } from '../../../../../lib/core/sync/syncObjectAttachmentPayloadExecutor';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import type { importCompanionImageResource } from './companionImageImporter';
import {
  loadCompanionWorkspaceNode,
  loadCompanionWorkspaceNodeFromDb
} from './companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

export function readCompanionImageArticle(nodeId: string) {
  return loadCompanionWorkspaceNode(nodeId).then((node): RecoverableImageArticle | null => {
    return node ? { content: node.content, imageSources: parseImageSources(node.imageSources) } : null;
  });
}

export function commitCompanionImageArticle(nodeId: string, before: RecoverableImageArticle, after: RecoverableImageArticle) {
  return runCompanionHighValueMutationTask(() => getIosCompanionDatabaseOwner().runWriter(async (db) => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, nodeId);
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
  const payload = { attachment_id: image.contentHash, original_name: image.storageKey, mime_type: image.mimeType,
    size_bytes: image.sizeBytes, created_at: now };
  const contentHash = await iosCompanionContentHash(payload);
  await db.transaction(async (tx) => {
    const [existing] = await tx.query<{ id: string }>('SELECT id FROM attachments WHERE id = ?', [image.contentHash]);
    if (existing) return;
    await applyAttachmentObject(tx, { object_id: image.contentHash, object_type: 'attachment',
      content_hash: contentHash, payload_json: JSON.stringify(payload), updated_at: now, deleted_at: null });
    await markIosCompanionMutation({ contentHash, db: tx, hostName, objectId: image.contentHash,
      objectType: 'attachment', updatedAt: now });
  });
}
