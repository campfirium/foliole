import {
  syncFromZeroDatasetDigest, SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';

function scalar(database, sql, prefix) {
  const statement = database.prepare(sql);
  return Number(typeof statement.pluck === 'function'
    ? statement.pluck().get(prefix) ?? 0 : statement.get(prefix)?.count ?? 0);
}

export function inspectSyncFromZeroDatasetFacts(database) {
  const prefix = `${SYNC_FROM_ZERO_DATASET.nodePrefix}%`;
  const nodes = database.prepare(`SELECT id, body_blob_hash FROM nodes
    WHERE id LIKE ? AND deleted_at IS NULL ORDER BY id`).all(prefix);
  const attachments = database.prepare(`SELECT na.node_id, ab.attachment_id, ab.content_hash
    FROM node_attachments na JOIN attachment_blobs ab ON ab.attachment_id = na.attachment_id
    WHERE na.node_id LIKE ? ORDER BY na.node_id, ab.attachment_id`).all(prefix);
  const attachmentIds = attachments.map(({ attachment_id }) => attachment_id);
  const contentHashes = nodes.map(({ body_blob_hash }) => body_blob_hash);
  const nodeIds = nodes.map(({ id }) => id);
  return {
    datasetAttachmentCount: attachments.length,
    datasetAttachmentIds: attachmentIds,
    datasetCachedAttachmentCount: scalar(database, `SELECT COUNT(*) AS count
      FROM node_attachments na JOIN attachment_blobs ab ON ab.attachment_id = na.attachment_id
      WHERE na.node_id LIKE ? AND ab.availability = 'cached'`, prefix),
    datasetCachedContentBlobCount: scalar(database, `SELECT COUNT(DISTINCT n.body_blob_hash) AS count
      FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
      WHERE n.id LIKE ? AND n.deleted_at IS NULL`, prefix),
    datasetContentBlobCount: scalar(database, `SELECT COUNT(DISTINCT n.body_blob_hash) AS count
      FROM nodes n JOIN content_blobs cb ON cb.hash = n.body_blob_hash
      WHERE n.id LIKE ? AND n.deleted_at IS NULL`, prefix),
    datasetContentHashes: contentHashes,
    datasetDigest: syncFromZeroDatasetDigest({ attachmentIds, contentHashes, nodeIds }),
    datasetNodeCount: nodes.length,
    datasetNodeIds: nodeIds
  };
}
