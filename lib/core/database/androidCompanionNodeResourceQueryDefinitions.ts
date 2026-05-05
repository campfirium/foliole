export const ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS = {
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
  readableArticleActiveNodeId: {
    resultKey: 'rows',
    sql: "SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1",
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  readableArticleByNodeId: {
    resultKey: 'articles',
    sql: readableArticleSql("WHERE n.id = ? LIMIT 1"),
    columns: readableArticleColumns()
  },
  readableArticleFirstNode: {
    resultKey: 'articles',
    sql:
      readableArticleSql("WHERE n.body_blob_hash IS NOT NULL OR TRIM(COALESCE(n.content, '')) <> ''") +
      ' ORDER BY COALESCE(no.position, 2147483647) ASC, n.created_at ASC LIMIT 1',
    columns: readableArticleColumns()
  },
  readableArticleReferencePdfAttachment: {
    resultKey: 'attachments',
    sql:
      'SELECT na.attachment_id FROM node_attachments na ' +
      "INNER JOIN attachments a ON a.id = na.attachment_id AND a.mime_type = 'application/pdf' " +
      "WHERE na.node_id = ? AND na.role = 'reference' ORDER BY na.attachment_id ASC LIMIT 1",
    columns: [{ key: 'attachment_id', source: 'attachment_id', type: 'string' }]
  },
  nodeViewStatesByDevice: {
    resultKey: 'states',
    sql: 'SELECT node_id, scroll_top, selection_from, selection_to, updated_at, source FROM node_view_state WHERE device_id = ?',
    columns: [
      { key: 'node_id', source: 'node_id', type: 'string' },
      { key: 'scroll_top', source: 'scroll_top', type: 'long' },
      { key: 'selection_from', source: 'selection_from', type: 'long' },
      { key: 'selection_to', source: 'selection_to', type: 'long' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'source', source: 'source', type: 'nullableString' }
    ]
  }
};

function readableArticleSql(whereClause: string) {
  return (
    'SELECT n.id, n.title, n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability ' +
    'FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
    'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash LEFT JOIN node_order no ON no.node_id = n.id ' +
    whereClause
  );
}

function readableArticleColumns() {
  return [
    { key: 'id', source: 'id', type: 'string' },
    { key: 'title', source: 'title', type: 'nullableString' },
    { key: 'content', source: 'content', type: 'nullableString' },
    { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' },
    { key: 'body_blob_data', source: 'body_blob_data', type: 'nullableString' },
    { key: 'availability', source: 'availability', type: 'nullableString' }
  ];
}
