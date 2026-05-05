export const ANDROID_COMPANION_RESOURCE_QUERY_DEFINITIONS = {
  nodeAttachments: {
    resultKey: 'attachments',
    sql:
      'SELECT na.attachment_id, na.role, a.mime_type, a.original_name ' +
      'FROM node_attachments na LEFT JOIN attachments a ON a.id = na.attachment_id ' +
      'WHERE na.node_id = ? ORDER BY na.role ASC, na.attachment_id ASC',
    columns: [
      { key: 'attachmentId', source: 'attachment_id', type: 'string' },
      { key: 'role', source: 'role', type: 'string' },
      { key: 'mimeType', source: 'mime_type', type: 'nullableString' },
      { key: 'originalName', source: 'original_name', type: 'nullableString' }
    ]
  },
  pdfPageTextPages: {
    resultKey: 'pages',
    sql:
      'SELECT page, text, page_width, page_height FROM pdf_page_text ' +
      'WHERE attachment_id = ? ORDER BY page ASC',
    columns: [
      { key: 'page', source: 'page', type: 'long' },
      { key: 'text', source: 'text', type: 'string' },
      { key: 'page_width', source: 'page_width', type: 'double' },
      { key: 'page_height', source: 'page_height', type: 'double' }
    ]
  },
  pdfPageTextSearch: {
    resultKey: 'results',
    sql:
      'SELECT attachment_id, page, text, page_width, page_height, instr(lower(text), ?) AS match_index ' +
      'FROM pdf_page_text WHERE instr(lower(text), ?) > 0 ORDER BY attachment_id ASC, page ASC LIMIT ?',
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'page', source: 'page', type: 'long' },
      { key: 'text', source: 'text', type: 'string' },
      { key: 'page_width', source: 'page_width', type: 'double' },
      { key: 'page_height', source: 'page_height', type: 'double' },
      { key: 'match_index', source: 'match_index', type: 'long' }
    ]
  },
  contentBlobMissingHashes: {
    resultKey: 'blobs',
    sql:
      'WITH body_refs AS (' +
      'SELECT n.body_blob_hash AS hash, ' +
      "CASE WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
      "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 " +
      'WHEN n.parent_id IS NULL THEN 2 ELSE 3 END AS priority, ' +
      'COALESCE(rd.last_handled_at, n.updated_at) AS updated_at ' +
      'FROM nodes n LEFT JOIN node_review nr ON nr.node_id = n.id ' +
      'LEFT JOIN node_reading rd ON rd.node_id = n.id ' +
      'WHERE n.body_blob_hash IS NOT NULL AND n.deleted_at IS NULL ' +
      'UNION ALL SELECT ed.body_blob_hash AS hash, 4 AS priority, ed.updated_at AS updated_at ' +
      'FROM external_documents ed WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1' +
      '), ranked_refs AS (' +
      'SELECT hash, MIN(priority) AS priority, MAX(updated_at) AS updated_at FROM body_refs GROUP BY hash' +
      ') SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0) AS size_bytes FROM content_blobs cb ' +
      'JOIN ranked_refs refs ON refs.hash = cb.hash LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash ' +
      "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL " +
      "ORDER BY CASE WHEN refs.priority = 0 THEN 0 WHEN cb.availability = 'failed' THEN 2 ELSE 1 END ASC, " +
      'refs.priority ASC, refs.updated_at DESC, cb.created_at ASC LIMIT ?',
    columns: [
      { key: 'hash', source: 'hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' }
    ]
  },
  contentBlobMissingSummaryRows: {
    resultKey: 'blobs',
    sql:
      'WITH body_refs AS (' +
      'SELECT n.body_blob_hash AS hash FROM nodes n WHERE n.body_blob_hash IS NOT NULL AND n.deleted_at IS NULL ' +
      'UNION SELECT ed.body_blob_hash AS hash FROM external_documents ed ' +
      'WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1' +
      ') SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0) AS size_bytes, cb.availability FROM content_blobs cb ' +
      'JOIN body_refs refs ON refs.hash = cb.hash LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash ' +
      "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL",
    columns: [
      { key: 'hash', source: 'hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' }
    ]
  }
};
