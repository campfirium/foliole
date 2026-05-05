export const ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES = {
  attachmentResources: {
    byIdQueryName: 'attachmentResourceMissingById',
    emptyResultKey: 'resource',
    minLimit: 1,
    resultKey: 'resources',
    rowsQueryName: 'attachmentResourceMissingRows',
    summaryQueryName: 'attachmentResourceMissingSummaryRows',
    rowKeys: {
      activeTopic: 'active_topic',
      attachmentId: 'attachment_id',
      availability: 'availability',
      contentHash: 'content_hash',
      dueReview: 'due_review',
      mimeType: 'mime_type',
      sizeBytes: 'size_bytes',
      storageKey: 'storage_key'
    },
    resourceFields: [
      { outputKey: 'attachment_id', rowKey: 'attachmentId', type: 'string' },
      { outputKey: 'content_hash', rowKey: 'contentHash', type: 'string' },
      { outputKey: 'size_bytes', rowKey: 'sizeBytes', type: 'long' }
    ],
    summaryKeys: {
      activeTopicCount: 'missing_active_topic_attachment_resource_count',
      bytes: 'missing_attachment_resource_bytes',
      count: 'missing_attachment_resource_count',
      dueReviewCount: 'missing_due_review_attachment_resource_count',
      failedBytes: 'failed_attachment_resource_bytes',
      failedCount: 'failed_attachment_resource_count',
      imageBytes: 'missing_image_attachment_resource_bytes',
      imageCount: 'missing_image_attachment_resource_count',
      otherBytes: 'missing_other_attachment_resource_bytes',
      otherCount: 'missing_other_attachment_resource_count',
      pdfBytes: 'missing_pdf_attachment_resource_bytes',
      pdfCount: 'missing_pdf_attachment_resource_count'
    },
    mimeCategories: {
      imagePrefix: 'image/',
      pdfMimeType: 'application/pdf'
    }
  },
  contentBlobs: {
    hashKey: 'hash',
    hashesResultKey: 'hashes',
    hashesQueryName: 'contentBlobMissingHashes',
    minLimit: 1,
    resultKey: 'blobs',
    summaryQueryName: 'contentBlobMissingSummaryRows',
    rowKeys: {
      availability: 'availability',
      sizeBytes: 'size_bytes'
    },
    summaryKeys: {
      bytes: 'missing_content_blob_bytes',
      count: 'missing_content_blob_count',
      failedBytes: 'failed_content_blob_bytes',
      failedCount: 'failed_content_blob_count'
    }
  }
} as const;
