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
  committed: 'committed',
  documentId: 'document_id',
  hash: 'hash',
  headers: 'headers',
  imageDisplay: 'image_display',
  limit: 'limit',
  mimeType: 'mime_type',
  presenceOnly: 'presence_only',
  query: 'query',
  resources: 'resources',
  storageKey: 'storage_key',
  url: 'url'
} as const;
