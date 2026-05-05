export const ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS = {
  attachmentResourceMissingRows: {
    resultKey: 'resources',
    sql:
      'WITH attachment_refs AS (' +
      'SELECT na.attachment_id AS attachment_id, ' +
      "CASE WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
      "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 2 END AS priority, " +
      'n.updated_at AS updated_at FROM node_attachments na JOIN nodes n ON n.id = na.node_id ' +
      'LEFT JOIN node_review nr ON nr.node_id = n.id WHERE n.deleted_at IS NULL' +
      '), ranked_refs AS (' +
      'SELECT attachment_id, MIN(priority) AS priority, MAX(updated_at) AS updated_at FROM attachment_refs GROUP BY attachment_id' +
      ') SELECT b.attachment_id, b.content_hash, COALESCE(b.size_bytes, 0) AS size_bytes, b.availability, b.storage_key ' +
      'FROM attachment_blobs b LEFT JOIN ranked_refs refs ON refs.attachment_id = b.attachment_id ' +
      "WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != '' " +
      "ORDER BY CASE WHEN refs.priority = 0 THEN 0 WHEN b.availability = 'failed' THEN 2 ELSE 1 END ASC, " +
      'COALESCE(refs.priority, 3) ASC, refs.updated_at DESC, b.created_at ASC',
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' }
    ]
  },
  attachmentResourceMissingSummaryRows: {
    resultKey: 'resources',
    sql:
      "SELECT b.availability, b.storage_key, COALESCE(b.size_bytes, 0) AS size_bytes, lower(COALESCE(b.mime_type, '')) AS mime_type, " +
      'EXISTS(SELECT 1 FROM node_attachments na JOIN nodes n ON n.id = na.node_id ' +
      'JOIN node_review nr ON nr.node_id = n.id WHERE na.attachment_id = b.attachment_id ' +
      "AND n.deleted_at IS NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') LIMIT 1) AS due_review, " +
      'EXISTS(SELECT 1 FROM node_attachments na JOIN nodes n ON n.id = na.node_id ' +
      'WHERE na.attachment_id = b.attachment_id AND n.deleted_at IS NULL ' +
      "AND n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) LIMIT 1) AS active_topic " +
      "FROM attachment_blobs b WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != ''",
    columns: [
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'mime_type', source: 'mime_type', type: 'string' },
      { key: 'due_review', source: 'due_review', type: 'long' },
      { key: 'active_topic', source: 'active_topic', type: 'long' }
    ]
  },
  attachmentResourceMissingById: {
    resultKey: 'resources',
    sql:
      'SELECT attachment_id, content_hash, COALESCE(size_bytes, 0) AS size_bytes, availability, storage_key FROM attachment_blobs ' +
      "WHERE attachment_id = ? AND content_hash IS NOT NULL AND TRIM(content_hash) != '' LIMIT 1",
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' }
    ]
  },
  attachmentResourceResolve: {
    resultKey: 'resources',
    sql: 'SELECT b.storage_key, b.mime_type FROM attachment_blobs b WHERE b.attachment_id = ? LIMIT 1',
    columns: [
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'mime_type', source: 'mime_type', type: 'nullableString' }
    ]
  },
  attachmentResourceContentHashesByIds: {
    resultKey: 'resources',
    sql: 'SELECT attachment_id, content_hash FROM attachment_blobs WHERE attachment_id IN (__ATTACHMENT_ID_FILTER__)',
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' }
    ]
  }
};
