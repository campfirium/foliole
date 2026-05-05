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
  },
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
  externalDocumentById: {
    resultKey: 'documents',
    sql:
      'SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, ' +
      'ed.content, ed.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability, updated_at ' +
      'FROM external_documents ed LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash WHERE document_id = ? AND is_present = 1 LIMIT 1',
    columns: externalDocumentColumns()
  },
  externalDocumentSearch: {
    resultKey: 'documents',
    sql:
      'SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, ' +
      'ed.content, ed.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability, updated_at, ' +
      'instr(lower(COALESCE(CAST(cbd.data AS TEXT), ed.content)), ?) AS match_index ' +
      'FROM external_documents ed LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash WHERE is_present = 1 ' +
      'AND (instr(lower(title), ?) > 0 OR instr(lower(file_name), ?) > 0 ' +
      "OR instr(lower(relative_path), ?) > 0 OR instr(lower(coalesce(opening_text, '')), ?) > 0 " +
      'OR instr(lower(COALESCE(CAST(cbd.data AS TEXT), ed.content)), ?) > 0) ' +
      'ORDER BY updated_at DESC LIMIT ?',
    columns: [...externalDocumentColumns(), { key: 'match_index', source: 'match_index', type: 'long' }]
  },
  externalSearchFolders: {
    resultKey: 'folders',
    sql: 'SELECT id, folder_path, document_count FROM external_search_folders ORDER BY folder_path COLLATE NOCASE ASC',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'folder_path', source: 'folder_path', type: 'string' },
      { key: 'document_count', source: 'document_count', type: 'long' }
    ]
  },
  externalDocumentDirectoryEntries: {
    resultKey: 'entries',
    sql:
      'SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, updated_at ' +
      'FROM external_documents WHERE is_present = 1 ORDER BY folder_id ASC, relative_path COLLATE NOCASE ASC',
    columns: [
      { key: 'document_id', source: 'document_id', type: 'string' },
      { key: 'folder_id', source: 'folder_id', type: 'string' },
      { key: 'relative_path', source: 'relative_path', type: 'string' },
      { key: 'file_name', source: 'file_name', type: 'string' },
      { key: 'extension', source: 'extension', type: 'nullableString' },
      { key: 'title', source: 'title', type: 'nullableString' },
      { key: 'opening_text', source: 'opening_text', type: 'nullableString' },
      { key: 'modified_at', source: 'updated_at', type: 'string' }
    ]
  }
};

function externalDocumentColumns() {
  return [
    { key: 'document_id', source: 'document_id', type: 'string' },
    { key: 'folder_id', source: 'folder_id', type: 'string' },
    { key: 'relative_path', source: 'relative_path', type: 'string' },
    { key: 'file_name', source: 'file_name', type: 'string' },
    { key: 'extension', source: 'extension', type: 'nullableString' },
    { key: 'title', source: 'title', type: 'nullableString' },
    { key: 'opening_text', source: 'opening_text', type: 'nullableString' },
    { key: 'content', source: 'content', type: 'nullableString' },
    { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' },
    { key: 'body_blob_data', source: 'body_blob_data', type: 'nullableString' },
    { key: 'availability', source: 'availability', type: 'nullableString' },
    { key: 'updated_at', source: 'updated_at', type: 'string' }
  ];
}
