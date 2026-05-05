export const ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS = {
  resourcePlugin: {
    defaults: {
      externalDocumentSearchLimit: 20,
      missingResourceLimit: 50,
      pdfPageTextSearchLimit: 20
    },
    requestKeys: {
      attachmentId: 'attachment_id',
      body: 'body',
      contentHash: 'content_hash',
      documentId: 'document_id',
      hash: 'hash',
      headers: 'headers',
      limit: 'limit',
      query: 'query',
      resources: 'resources',
      url: 'url'
    }
  }
} as const;
