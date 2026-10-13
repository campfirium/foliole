import { createHash } from 'node:crypto';

import {
  syncFromZeroDatasetDigest, SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';

export function inspectSyncFromZeroDatasetFacts(database, availableAttachmentIds = null) {
  const prefix = `${SYNC_FROM_ZERO_DATASET.nodePrefix}%`;
  const nodes = database.prepare(`SELECT n.id, n.body_blob_hash, n.content, v.body_text
    FROM nodes n LEFT JOIN node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
    WHERE n.id LIKE ? AND n.deleted_at IS NULL ORDER BY n.id`).all(prefix);
  const completeBodies = nodes.filter(node => typeof node.body_text === 'string' &&
    createHash('sha256').update(node.body_text).digest('hex') === node.body_blob_hash);
  const attachments = database.prepare(`SELECT owner.id AS node_id,
    substr(json_extract(resource.value, '$.storage_key'), 1, 64) AS attachment_id
    FROM nodes owner, json_each(owner.resource_references) resource
    WHERE owner.id LIKE ? AND owner.deleted_at IS NULL ORDER BY owner.id, attachment_id`).all(prefix);
  const attachmentIds = attachments.map(({ attachment_id }) => attachment_id);
  const contentHashes = nodes.map(({ body_blob_hash }) => body_blob_hash);
  const nodeIds = nodes.map(({ id }) => id);
  return {
    datasetAttachmentCount: attachments.length,
    datasetAttachmentIds: attachmentIds,
    datasetCachedAttachmentCount: availableAttachmentIds == null ? null
      : attachments.filter(({ attachment_id }) => availableAttachmentIds.includes(attachment_id)).length,
    datasetCachedContentBlobCount: completeBodies.filter(node => node.content === node.body_text).length,
    datasetContentBlobCount: completeBodies.length,
    datasetContentHashes: contentHashes,
    datasetDigest: syncFromZeroDatasetDigest({ attachmentIds, contentHashes, nodeIds }),
    datasetNodeCount: nodes.length,
    datasetNodeIds: nodeIds
  };
}
