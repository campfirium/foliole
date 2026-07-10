import {
  androidBodyStatusExpression,
  androidResolvedContentExpression,
  androidSearchExcerptExpression
} from './androidCompanionDerivedReadSql.js';

const EXTERNAL_DOCUMENT_INLINE_CONTENT = 'ed.content';
const EXTERNAL_DOCUMENT_BODY_BLOB_DATA = 'CAST(cbd.data AS TEXT)';
const EXTERNAL_DOCUMENT_CONTENT = androidResolvedContentExpression(
  EXTERNAL_DOCUMENT_INLINE_CONTENT,
  EXTERNAL_DOCUMENT_BODY_BLOB_DATA
);
const EXTERNAL_DOCUMENT_STATUS = androidBodyStatusExpression({
  availabilityExpression: 'cb.availability',
  bodyBlobDataExpression: EXTERNAL_DOCUMENT_BODY_BLOB_DATA,
  bodyBlobHashExpression: 'ed.body_blob_hash',
  contentExpression: EXTERNAL_DOCUMENT_CONTENT,
  emptyWhenBlank: false
});
const EXTERNAL_DOCUMENT_EXCERPT_RADIUS = 80;

export const ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS = {
  externalDocumentById: {
    resultKey: 'documents',
    sql:
      'SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, ' +
      `${EXTERNAL_DOCUMENT_CONTENT} AS content, ed.body_blob_hash, ${EXTERNAL_DOCUMENT_STATUS} AS content_status, updated_at ` +
      'FROM external_documents ed LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash WHERE document_id = ? AND is_present = 1 LIMIT 1',
    columns: externalDocumentColumns()
  },
  externalDocumentSearch: {
    resultKey: 'documents',
    sql:
      'SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, ' +
      `${EXTERNAL_DOCUMENT_CONTENT} AS content, ed.body_blob_hash, ${EXTERNAL_DOCUMENT_STATUS} AS content_status, updated_at, ` +
      'max(0, instr(lower(' + EXTERNAL_DOCUMENT_CONTENT + '), ?) - 1) AS match_start, ' +
      `${androidSearchExcerptExpression(EXTERNAL_DOCUMENT_CONTENT, '?', EXTERNAL_DOCUMENT_EXCERPT_RADIUS)} AS excerpt ` +
      'FROM external_documents ed LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash WHERE is_present = 1 ' +
      'AND (instr(lower(title), ?) > 0 OR instr(lower(file_name), ?) > 0 ' +
      "OR instr(lower(relative_path), ?) > 0 OR instr(lower(coalesce(opening_text, '')), ?) > 0 " +
      `OR instr(lower(${EXTERNAL_DOCUMENT_CONTENT}), ?) > 0) ` +
      'ORDER BY updated_at DESC LIMIT ?',
    columns: [
      ...externalDocumentColumns(),
      { key: 'match_start', source: 'match_start', type: 'long' },
      { key: 'excerpt', source: 'excerpt', type: 'string' }
    ]
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
    { key: 'content_status', source: 'content_status', type: 'string' },
    { key: 'updated_at', source: 'updated_at', type: 'string' }
  ];
}
