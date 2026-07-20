export const COMPANION_RESOURCE_PLUGIN_DEFAULTS = {
  externalDocumentSearchLimit: 20,
  missingResourceLimit: 50,
  pdfPageTextSearchLimit: 20,
  topicSearchLimit: 20
} as const;

export const COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS = {
  attachmentId: 'attachment_id',
  batchToken: 'batch_token',
  body: 'body',
  contentHash: 'content_hash',
  documentId: 'document_id',
  hash: 'hash',
  headers: 'headers',
  limit: 'limit',
  query: 'query',
  resources: 'resources',
  url: 'url'
} as const;
